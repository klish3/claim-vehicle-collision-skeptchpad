import { useMemo, useReducer, useState } from 'react';
import { historyReducer, initHistory, uid, type View } from './diagram';
import { DiagramEditor } from './DiagramEditor';
import { developmentGeocoder, developmentMapLayers, type Geocoder, type MapLayer } from './geo';
import { useWorkingLayers } from './hooks';
import { Icon } from './glyphs';
import { LocationStep } from './LocationStep';
import { buildPayload, validate } from './payload';
import { ReviewStep } from './ReviewStep';
import type { CollisionFnolPayload, IncidentLocation, SubmitResult } from './types';
import styles from './CollisionFnol.module.css';

export interface CollisionFnolProps {
  /**
   * Called with the payload when the customer presses Send. Return a
   * reference to show on the confirmation screen; throw to show an error.
   */
  onSubmit?: (payload: CollisionFnolPayload) => Promise<SubmitResult | void>;
  /** Alternative to onSubmit: POST the payload as JSON to this URL. */
  endpoint?: string;
  /** Extra headers for `endpoint` (auth, correlation ids…). */
  headers?: Record<string, string>;
  /**
   * Address lookup. Defaults to keyless development services (postcodes.io, then
   * Photon, then Nominatim), restricted to `countryCodes`. Use a licensed service in production.
   */
  geocoder?: Geocoder;
  countryCodes?: string;
  /**
   * Map backgrounds offered to the customer, in order of preference. Each is
   * health-checked at the incident location; any that fail are hidden, and if
   * none work the customer draws on a road sketch instead. Pass [] for no map.
   *
   * Defaults to keyless development layers (Esri street map + satellite).
   * For production use licensed layers, e.g.
   * `[osMapsLayer({ apiKey: OS_KEY }), esriImageryLayer({ apiKey: ARCGIS_KEY })]`.
   */
  mapLayers?: MapLayer[];
  /**
   * Adds an SVG rendering of the sketch to the payload. Default true.
   * Map tiles are referenced by URL, so turn this off (or proxy tiles) if your tile URLs carry an API key.
   */
  includeSnapshot?: boolean;
  /** Skip the search when the location is already known (e.g. from telematics). */
  initialLocation?: IncidentLocation;
  className?: string;
}

type Step = 'location' | 'sketch' | 'review' | 'done';

const STEPS: Array<{ id: Exclude<Step, 'done'>; label: string }> = [
  { id: 'location', label: 'Where' },
  { id: 'sketch', label: 'Sketch' },
  { id: 'review', label: 'Check and send' },
];

/** scale 0 lets the editor pick a zoom that suits the screen width. */
const defaultView = (): View => ({ center: { x: 0, y: 0 }, scale: 0 });

export function CollisionFnol({
  onSubmit,
  endpoint,
  headers,
  geocoder: geocoderProp,
  countryCodes = 'gb',
  mapLayers,
  includeSnapshot = true,
  initialLocation,
  className,
}: CollisionFnolProps) {
  const geocoder = useMemo(() => geocoderProp ?? developmentGeocoder(countryCodes), [geocoderProp, countryCodes]);
  const [step, setStep] = useState<Step>(initialLocation ? 'sketch' : 'location');
  const [location, setLocation] = useState<IncidentLocation | null>(initialLocation ?? null);
  const [occurredAt, setOccurredAt] = useState('');
  const [history, dispatch] = useReducer(historyReducer, undefined, () =>
    initHistory(initialLocation?.coordinates ? 'MAP' : 'SCHEMATIC'),
  );
  const [view, setView] = useState<View>(defaultView);
  const [submissionId, setSubmissionId] = useState(uid);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [layerId, setLayerId] = useState<string | null>(null);

  const layers = useMemo(() => mapLayers ?? developmentMapLayers(), [mapLayers]);
  const origin = location?.coordinates ?? null;
  const { status: mapStatus, working } = useWorkingLayers(layers, layers.length ? origin : null);
  const activeLayer = working.find((l) => l.id === layerId) ?? working[0] ?? null;
  const diagram = history.present;
  const issues = useMemo(() => validate(diagram, location, occurredAt), [diagram, location, occurredAt]);

  const payloadFor = (snapshotSvg: string | null): CollisionFnolPayload | null =>
    location
      ? buildPayload({
          diagram,
          location,
          occurredAt,
          clientSubmissionId: submissionId,
          mapLayer: activeLayer,
          snapshotSvg,
        })
      : null;
  const preview = step === 'review' ? payloadFor(null) : null;

  const confirmLocation = (loc: IncidentLocation) => {
    setLocation(loc);
    dispatch({ type: 'setBackdrop', backdrop: loc.coordinates && layers.length ? 'MAP' : 'SCHEMATIC' });
    setView(defaultView());
    setStep('sketch');
  };

  const send = async (snapshotSvg: string | null) => {
    const payload = payloadFor(snapshotSvg);
    if (!payload) return;
    setSending(true);
    setSendError(null);
    try {
      let result: SubmitResult | void = undefined;
      if (onSubmit) {
        result = await onSubmit(payload);
      } else if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': payload.clientSubmissionId, ...headers },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`We couldn’t send your sketch (error ${res.status}). Please try again.`);
        const text = await res.text();
        try {
          result = text ? (JSON.parse(text) as SubmitResult) : undefined;
        } catch {
          result = undefined;
        }
      } else {
        console.info('[CollisionFnol] No onSubmit or endpoint provided. Payload:', payload);
      }
      setReference(result?.reference ?? null);
      setStep('done');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'We couldn’t send your sketch. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const restart = () => {
    setLocation(null);
    setOccurredAt('');
    dispatch({ type: 'reset', backdrop: 'SCHEMATIC' });
    setView(defaultView());
    setSubmissionId(uid());
    setReference(null);
    setSendError(null);
    setStep('location');
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const reachable = (s: Step) => s === 'location' || (!!location && (s === 'sketch' || s === 'review'));

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {step !== 'done' && (
        <nav aria-label="Progress">
          <ol className={styles.stepper}>
            {STEPS.map((s, i) => {
              const state = i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo';
              return (
                <li key={s.id} className={styles.step} data-state={state}>
                  <button
                    type="button"
                    onClick={() => setStep(s.id)}
                    disabled={state === 'current' || !reachable(s.id)}
                    aria-current={state === 'current' ? 'step' : undefined}
                  >
                    <span className={styles.stepNum}>{state === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      {step === 'location' && (
        <LocationStep
          geocoder={geocoder}
          value={location}
          occurredAt={occurredAt}
          onOccurredAtChange={setOccurredAt}
          onConfirm={confirmLocation}
        />
      )}

      {step === 'sketch' && location && (
        <section className={styles.card} aria-label="Sketch what happened">
          <div className={styles.locationBar}>
            <Icon name="pin" />
            <span className={styles.locationLabel}>{location.label || 'Location not on the map'}</span>
            <button type="button" className={styles.linkBtn} onClick={() => setStep('location')}>
              Change
            </button>
          </div>
          <DiagramEditor
            history={history}
            dispatch={dispatch}
            view={view}
            setView={setView}
            origin={origin}
            layers={working}
            activeLayer={activeLayer}
            mapStatus={mapStatus}
            onSelectLayer={setLayerId}
          />
          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setStep('location')}>
              Back
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setStep('review')}>
              Review and send
            </button>
          </div>
        </section>
      )}

      {step === 'review' && preview && (
        <ReviewStep
          diagram={diagram}
          view={view}
          origin={origin}
          layer={activeLayer}
          issues={issues}
          preview={preview}
          sending={sending}
          error={sendError}
          onBack={() => setStep('sketch')}
          onSend={send}
          includeSnapshot={includeSnapshot}
        />
      )}

      {step === 'done' && (
        <section className={`${styles.card} ${styles.done}`} role="status">
          <span className={styles.doneIcon}>
            <Icon name="check" size={28} />
          </span>
          <h2 className={styles.h2}>Sketch sent</h2>
          {reference ? (
            <p>
              Your reference is <strong>{reference}</strong>. Keep it handy if you call us.
            </p>
          ) : (
            <p>We’ve got your sketch. We’ll be in touch about the next steps.</p>
          )}
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={restart}>
            Report another accident
          </button>
        </section>
      )}
    </div>
  );
}

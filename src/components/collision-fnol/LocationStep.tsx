import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { GeoResult, Geocoder } from './geo';
import { Icon } from './glyphs';
import type { IncidentLocation } from './types';
import styles from './CollisionFnol.module.css';

export interface LocationStepProps {
  geocoder: Geocoder;
  value: IncidentLocation | null;
  occurredAt: string;
  onOccurredAtChange: (value: string) => void;
  onConfirm: (location: IncidentLocation) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; what: 'search' | 'gps' }
  | { kind: 'error'; message: string }
  | { kind: 'results'; results: GeoResult[] };

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function LocationStep({ geocoder, value, occurredAt, onOccurredAtChange, onConfirm }: LocationStepProps) {
  const id = useId();
  const [query, setQuery] = useState(value?.query ?? '');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const canGps = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => () => abort.current?.abort(), []);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3) {
      setStatus({ kind: 'error', message: 'Enter at least 3 characters: a road name, postcode or landmark.' });
      return;
    }
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStatus({ kind: 'loading', what: 'search' });
    try {
      const results = await geocoder.search(q, ctrl.signal);
      setStatus({ kind: 'results', results });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'We couldn’t look up that address.' });
    }
  };

  const choose = (r: GeoResult) =>
    onConfirm({
      source: 'SEARCH',
      query: query.trim(),
      label: r.label,
      coordinates: { lat: r.lat, lng: r.lng },
      road: r.road,
      postcode: r.postcode,
      town: r.town,
      provider: r.provider,
      providerRef: r.id,
    });

  const useGps = () => {
    setStatus({ kind: 'loading', what: 'gps' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        let match: GeoResult | null = null;
        try {
          match = (await geocoder.reverse?.(point)) ?? null;
        } catch {
          /* coordinates alone are still useful */
        }
        onConfirm({
          source: 'DEVICE_GPS',
          query: '',
          label: match?.label ?? `Near ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
          coordinates: point,
          road: match?.road,
          postcode: match?.postcode,
          town: match?.town,
          provider: match?.provider,
          providerRef: match?.id,
          accuracyM: Math.round(pos.coords.accuracy),
        });
      },
      (err) =>
        setStatus({
          kind: 'error',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Location access was blocked. Search for the address instead.'
              : 'We couldn’t get your location. Search for the address instead.',
        }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const manual = () => onConfirm({ source: 'MANUAL', query: query.trim(), label: query.trim(), coordinates: null });

  return (
    <section className={styles.card} aria-labelledby={`${id}-h`}>

      <div className={styles.field}>
        <label htmlFor={`${id}-when`} className={styles.label}>
          When did it happen? <span className={styles.muted}>(optional)</span>
        </label>
        <input
          id={`${id}-when`}
          className={`${styles.input} ${styles.inputNarrow}`}
          type="datetime-local"
          value={occurredAt}
          max={nowLocal()}
          onChange={(e) => onOccurredAtChange(e.target.value)}
        />
      </div>
      <h2 id={`${id}-h`} className={styles.h2}>
        Where did it happen?
      </h2>
      <p className={styles.muted}>
        Search for the road, junction or postcode. We’ll show you the map so you can draw what happened.
      </p>

      <form className={styles.searchRow} onSubmit={search} role="search">
        <label htmlFor={`${id}-q`} className={styles.srOnly}>
          Road, junction or postcode
        </label>
        <input
          id={`${id}-q`}
          className={styles.input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. High Street, Guildford or GU1 3AA"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={status.kind === 'loading'}>
          <Icon name="search" /> Find
        </button>
      </form>

      {canGps && (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={useGps}
          disabled={status.kind === 'loading'}
        >
          <Icon name="gps" /> I’m at the scene, use my location
        </button>
      )}

      <div aria-live="polite" className={styles.statusArea}>
        {status.kind === 'loading' && (
          <p className={styles.muted}>{status.what === 'gps' ? 'Finding your location…' : 'Searching…'}</p>
        )}
        {status.kind === 'error' && <p className={styles.errorText}>{status.message}</p>}
        {status.kind === 'results' &&
          (status.results.length ? (
            <ul className={styles.results} aria-label="Matching places">
              {status.results.map((r) => (
                <li key={r.id}>
                  <button type="button" className={styles.resultBtn} onClick={() => choose(r)}>
                    <Icon name="pin" />
                    <span>{r.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>No matches. Try a nearby road name or postcode.</p>
          ))}
        {(status.kind === 'results' || status.kind === 'error') && query.trim().length >= 3 && (
          <button type="button" className={styles.linkBtn} onClick={manual}>
            Can’t find it? Continue with a road sketch instead
          </button>
        )}
      </div>

    </section>
  );
}

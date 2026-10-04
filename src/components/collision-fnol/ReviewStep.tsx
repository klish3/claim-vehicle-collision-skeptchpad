import { useId, useMemo, useRef } from 'react';
import { fitView, type Diagram, type View } from './diagram';
import { DiagramScene } from './DiagramScene';
import { Icon } from './glyphs';
import { useElementWidth } from './hooks';
import type { ValidationIssue } from './payload';
import type { MapLayer } from './geo';
import type { CollisionFnolPayload, LatLng } from './types';
import styles from './CollisionFnol.module.css';

export interface ReviewStepProps {
  diagram: Diagram;
  view: View;
  origin: LatLng | null;
  layer: MapLayer | null;
  issues: ValidationIssue[];
  /** Builds the payload; `snapshotSvg` is null for the on-screen preview. */
  preview: CollisionFnolPayload;
  sending: boolean;
  error: string | null;
  onBack: () => void;
  onSend: (snapshotSvg: string | null) => void;
  includeSnapshot: boolean;
}

export function ReviewStep(props: ReviewStepProps) {
  const { diagram, origin, layer, issues, preview, sending, error, onBack, onSend } = props;
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useElementWidth(wrapRef, 720);
  const height = Math.min(440, Math.max(260, Math.round(width * 0.55)));
  const view = useMemo(
    () => fitView(diagram.items, width, height, props.view.scale > 0 ? props.view : { ...props.view, scale: 9 }),
    [diagram.items, width, height, props.view],
  );

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const json = useMemo(
    () =>
      JSON.stringify(
        {
          ...preview,
          diagram: { ...preview.diagram, snapshotSvg: props.includeSnapshot ? '<svg … added when you send>' : null },
        },
        null,
        2,
      ),
    [preview, props.includeSnapshot],
  );

  const send = () => {
    let svg: string | null = null;
    if (props.includeSnapshot && svgRef.current && typeof XMLSerializer !== 'undefined') {
      svg = new XMLSerializer().serializeToString(svgRef.current);
    }
    onSend(svg);
  };

  return (
    <section className={styles.card} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={styles.h2}>
        Check your sketch
      </h2>

      <div ref={wrapRef} className={styles.previewWrap}>
        <DiagramScene
          width={width}
          height={height}
          diagram={diagram}
          view={view}
          origin={origin}
          layer={layer}
          title="Accident sketch"
          svgRef={svgRef}
          svgProps={{ className: styles.previewSvg, role: 'img', 'aria-label': preview.incident.summary.join(' ') }}
        />
      </div>

      <h3 className={styles.h3}>What we’ll tell the claims team</h3>
      <ul className={styles.summaryList}>
        {preview.incident.summary.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className={styles.issues} role={errors.length ? 'alert' : 'status'}>
          {errors.map((e) => (
            <p key={e.message} className={styles.issueError}>
              {e.message}
            </p>
          ))}
          {warnings.map((w) => (
            <p key={w.message} className={styles.issueWarn}>
              {w.message}
            </p>
          ))}
          {!errors.length && (
            <p className={styles.muted}>You can still send it. Fixing these helps us settle your claim faster.</p>
          )}
        </div>
      )}

      <details className={styles.details}>
        <summary>Show the data that will be sent (JSON)</summary>
        <pre className={styles.jsonPre}>{json}</pre>
      </details>

      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onBack} disabled={sending}>
          Back to sketch
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={send}
          disabled={sending || errors.length > 0}
          aria-busy={sending}
        >
          <Icon name="check" /> {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </section>
  );
}

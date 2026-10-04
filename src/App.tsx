import { useState } from 'react';
import { CollisionFnol, type CollisionFnolPayload, type SubmitResult } from './components/collision-fnol';
import './App.css';

/**
 * Demo host for CollisionFnol.
 *
 * Set VITE_FNOL_ENDPOINT to POST the payload to a real back end; otherwise
 * submissions are captured locally and shown below the form.
 */
const endpoint = import.meta.env.VITE_FNOL_ENDPOINT as string | undefined;

function fakeReference(): string {
  return `MTR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export default function App() {
  const [submitted, setSubmitted] = useState<CollisionFnolPayload | null>(null);

  const onSubmit = async (payload: CollisionFnolPayload): Promise<SubmitResult> => {
    // Simulate network latency so the sending state is visible.
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSubmitted(payload);
    return { reference: fakeReference() };
  };

  const download = () => {
    if (!submitted) return;
    const blob = new Blob([JSON.stringify(submitted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fnol-${submitted.clientSubmissionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="app-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 17h14M6 17l1.5-5h9L18 17M8 12l1-3h6l1 3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="8" cy="18" r="1.5" />
              <circle cx="16" cy="18" r="1.5" />
            </svg>
          </span>
          <div>
            <h1 className="app-title">Report a vehicle collision</h1>
            <p className="app-subtitle">Tell us where it happened, then sketch what happened.</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        {endpoint ? (
          <CollisionFnol endpoint={endpoint} />
        ) : (
          <CollisionFnol onSubmit={onSubmit} />
        )}

        {submitted && (
          <section className="payload" aria-label="Submitted payload">
            <div className="payload-head">
              <h2>Submitted payload</h2>
              <div className="payload-actions">
                <button type="button" onClick={download}>
                  Download JSON
                </button>
                <button type="button" onClick={() => setSubmitted(null)}>
                  Clear
                </button>
              </div>
            </div>
            {submitted.diagram.snapshotSvg && (
              <figure className="payload-snapshot">
                <div dangerouslySetInnerHTML={{ __html: submitted.diagram.snapshotSvg }} />
                <figcaption>Snapshot sent with the payload</figcaption>
              </figure>
            )}
            <pre className="payload-json">{JSON.stringify(submitted, null, 2)}</pre>
          </section>
        )}
      </main>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { probeLayer, type MapLayer } from './geo';
import type { LatLng } from './types';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Tracks an element's content width (SSR-safe; falls back until mounted). */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** Ref that always holds the latest value, for use inside window listeners. */
export function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  useIsoLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export type MapStatus = 'idle' | 'checking' | 'ready' | 'unavailable';

/**
 * Probes each configured tile layer at the incident location and returns
 * the ones that actually work there, in the order they were given.
 */
export function useWorkingLayers(
  layers: MapLayer[],
  origin: LatLng | null,
): { status: MapStatus; working: MapLayer[] } {
  const key = origin ? `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${layers.map((l) => l.id).join(',')}` : '';
  const [result, setResult] = useState<{ key: string; working: MapLayer[] } | null>(null);
  const latestLayers = useLatest(layers);

  useEffect(() => {
    if (!origin || !key) return;
    const ctrl = new AbortController();
    const candidates = latestLayers.current;
    Promise.all(candidates.map((l) => probeLayer(l, origin, ctrl.signal))).then((ok) => {
      if (!ctrl.signal.aborted) setResult({ key, working: candidates.filter((_, i) => ok[i]) });
    });
    return () => ctrl.abort();
    // `key` captures origin + layer ids; re-probing on every render would waste tile requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!origin) return { status: 'idle', working: [] };
  if (!result || result.key !== key) return { status: 'checking', working: [] };
  return { status: result.working.length ? 'ready' : 'unavailable', working: result.working };
}

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';
import {
  LAYOUT_LABELS,
  MAX_SCALE,
  MIN_SCALE,
  OBJECT_SPECS,
  VEHICLE_SPECS,
  arrowBearings,
  bearing,
  createArrow,
  createImpact,
  createObject,
  createVehicle,
  dist,
  fitView,
  freeSpotNear,
  isArrow,
  isVehicle,
  midpoint,
  nextLetter,
  normalise360,
  vehicleAt,
  vehicleColour,
  type ArrowItem,
  type DiagramAction,
  type DiagramItem,
  type History,
  type ObjectItem,
  type VehicleItem,
  type Vec,
  type View,
} from './diagram';
import { DiagramScene, type HandlePart } from './DiagramScene';
import { vehicleLabel } from './payload';
import { Icon, PaletteIcon, type PaletteEntry } from './glyphs';
import { useElementWidth, useLatest } from './hooks';
import type { LatLng, ObjectKind, SchematicLayout, VehicleKind, VehicleMotion } from './types';
import type { MapLayer } from './geo';
import type { MapStatus } from './hooks';
import styles from './CollisionFnol.module.css';

export interface DiagramEditorProps {
  history: History;
  dispatch: Dispatch<DiagramAction>;
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  origin: LatLng | null;
  /** Map layers that passed the health check at this location, in preference order. */
  layers: MapLayer[];
  activeLayer: MapLayer | null;
  mapStatus: MapStatus;
  onSelectLayer: (id: string) => void;
}

type Tool = 'select' | 'arrow';

type Gesture =
  | { kind: 'move'; pointerId: number; id: string; start: Vec; orig: DiagramItem; moved: boolean }
  | { kind: 'rotate'; pointerId: number; id: string }
  | { kind: 'from' | 'to' | 'mid'; pointerId: number; id: string; orig: ArrowItem; last?: ArrowItem }
  | { kind: 'draw'; pointerId: number; id: string; vehicleId: string | null; from: Vec; to: Vec }
  | { kind: 'pan'; pointerId: number; startClient: Vec; startCenter: Vec; k: number; moved: boolean }
  | { kind: 'pinch'; ids: [number, number]; d0: number; s0: number; anchor: Vec };

const VEHICLE_ENTRIES: PaletteEntry[] = [
  { type: 'vehicle', kind: 'CAR', role: 'POLICYHOLDER', label: 'Your vehicle' },
  { type: 'vehicle', kind: 'CAR', role: 'THIRD_PARTY', label: 'Other vehicle' },
];
const OBJECT_ENTRIES: PaletteEntry[] = (Object.keys(OBJECT_SPECS) as ObjectKind[]).map((kind) => ({
  type: 'object',
  kind,
  label: OBJECT_SPECS[kind].label,
}));
const IMPACT_ENTRY: PaletteEntry = { type: 'impact', label: 'Impact point' };

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
const snap = (deg: number, step: number) => normalise360(Math.round(deg / step) * step);

function translateItem(item: DiagramItem, dx: number, dy: number): DiagramItem {
  if (item.type === 'arrow') {
    const t = (p: Vec) => ({ x: p.x + dx, y: p.y + dy });
    return { ...item, from: t(item.from), to: t(item.to), ctrl: t(item.ctrl) };
  }
  return { ...item, x: item.x + dx, y: item.y + dy };
}

function rotateItem(item: DiagramItem, heading: number): DiagramItem {
  if (item.type === 'vehicle') return { ...item, heading: normalise360(heading), headingSetByUser: true };
  if (item.type === 'object') return { ...item, heading: normalise360(heading) };
  return item;
}

export function DiagramEditor({
  history,
  dispatch,
  view: viewProp,
  setView,
  origin,
  layers,
  activeLayer,
  mapStatus,
  onSelectLayer,
}: DiagramEditorProps) {
  const domId = useId();
  const diagram = history.present;
  const items = diagram.items;
  const wantsMap = diagram.backdrop === 'MAP' && !!origin;
  const onMap = wantsMap && !!activeLayer;
  const mapLoading = wantsMap && mapStatus === 'checking';
  const mapFailed = wantsMap && mapStatus === 'unavailable';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [arrowFor, setArrowFor] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ entry: PaletteEntry; x: number; y: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Vec>());
  const suppressClick = useRef(false);

  const width = useElementWidth(wrapRef, 800);
  const height = Math.min(640, Math.max(360, Math.round(width * 0.68)));
  // A scale of 0 means "pick a sensible zoom for this screen": roughly 70 m across.
  const autoScale = clampScale(Math.min(13, width / 70));
  const view: View = viewProp.scale > 0 ? viewProp : { ...viewProp, scale: autoScale };
  const latestAutoScale = useLatest(autoScale);
  const scaleOf = (v: View) => (v.scale > 0 ? v.scale : latestAutoScale.current);
  const latestItems = useLatest(items);
  const latestView = useLatest(view);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const hasPolicyholder = items.some((i) => isVehicle(i) && i.role === 'POLICYHOLDER');

  const toWorld = useCallback((clientX: number, clientY: number): Vec | null => {
    const m = worldRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, []);

  /* ---------------------------- adding items ---------------------------- */

  const addEntry = (entry: PaletteEntry, at: Vec) => {
    const current = latestItems.current;
    let item: DiagramItem;
    if (entry.type === 'vehicle') {
      if (entry.role === 'POLICYHOLDER' && current.some((i) => isVehicle(i) && i.role === 'POLICYHOLDER')) return;
      item = createVehicle(current, entry.role, entry.kind, at);
    } else if (entry.type === 'object') {
      item = createObject(entry.kind, at);
    } else {
      item = createImpact(at);
    }
    dispatch({ type: 'add', item });
    setSelectedId(item.id);
    setTool('select');
    setAnnouncement(`${item.type === 'vehicle' ? `Vehicle ${item.letter}` : entry.label} added to the sketch.`);
  };

  const onPalettePointerDown = (e: ReactPointerEvent<HTMLButtonElement>, entry: PaletteEntry) => {
    if (e.button !== 0 || e.currentTarget.disabled) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) dragging = true;
      if (dragging) setGhost({ entry, x: ev.clientX, y: ev.clientY });
    };
    const finish = (ev: PointerEvent, cancelled: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      setGhost(null);
      if (!dragging) return; // a plain tap is handled by onClick
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 0);
      if (cancelled) return;
      const rect = svgRef.current?.getBoundingClientRect();
      const inside =
        rect &&
        ev.clientX >= rect.left &&
        ev.clientX <= rect.right &&
        ev.clientY >= rect.top &&
        ev.clientY <= rect.bottom;
      const p = inside ? toWorld(ev.clientX, ev.clientY) : null;
      if (p) addEntry(entry, p);
    };
    const onUp = (ev: PointerEvent) => finish(ev, false);
    const onCancel = (ev: PointerEvent) => finish(ev, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  const onPaletteClick = (entry: PaletteEntry) => {
    if (suppressClick.current) return;
    addEntry(entry, freeSpotNear(items, view.center));
  };

  /* ----------------------------- canvas input ---------------------------- */

  const capture = (pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture(pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const beginDraw = (pointerId: number, p: Vec, vehicleId: string | null) => {
    const arrow = createArrow(p, p, vehicleId);
    dispatch({ type: 'gestureStart' });
    dispatch({ type: 'add', item: arrow });
    setSelectedId(arrow.id);
    gesture.current = { kind: 'draw', pointerId, id: arrow.id, vehicleId, from: p, to: p };
    capture(pointerId);
  };

  const startPinchIfTwoPointers = (): boolean => {
    if (pointers.current.size !== 2) return false;
    const g = gesture.current;
    if (g && g.kind !== 'pan') return false; // don't hijack an item drag
    const [a, b] = [...pointers.current.entries()] as [[number, Vec], [number, Vec]];
    const mid = midpoint(a[1], b[1]);
    const anchor = toWorld(mid.x, mid.y);
    if (!anchor) return false;
    gesture.current = {
      kind: 'pinch',
      ids: [a[0], b[0]],
      d0: dist(a[1], b[1]) || 1,
      s0: latestView.current.scale,
      anchor,
    };
    return true;
  };

  const onItemPointerDown = (e: ReactPointerEvent<SVGElement>, id: string, part: HandlePart) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.current) return;
    const item = items.find((i) => i.id === id);
    const p = toWorld(e.clientX, e.clientY);
    if (!item || !p) return;

    if (tool === 'arrow' && part === 'body') {
      beginDraw(e.pointerId, p, item.type === 'vehicle' ? item.id : arrowFor);
      return;
    }
    setSelectedId(id);
    dispatch({ type: 'gestureStart' });
    if (part === 'body')
      gesture.current = { kind: 'move', pointerId: e.pointerId, id, start: p, orig: item, moved: false };
    else if (part === 'rotate') gesture.current = { kind: 'rotate', pointerId: e.pointerId, id };
    else if (item.type === 'arrow') gesture.current = { kind: part, pointerId: e.pointerId, id, orig: item };
    capture(e.pointerId);
  };

  const onBackgroundPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (startPinchIfTwoPointers()) return;
    if (gesture.current) return;
    const p = toWorld(e.clientX, e.clientY);
    if (!p) return;
    if (tool === 'arrow') {
      beginDraw(e.pointerId, p, vehicleAt(items, p)?.id ?? arrowFor);
      return;
    }
    const k = worldRef.current?.getScreenCTM()?.a ?? view.scale;
    gesture.current = {
      kind: 'pan',
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startCenter: view.center,
      k,
      moved: false,
    };
    capture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.kind === 'pinch') {
      const a = pointers.current.get(g.ids[0]);
      const b = pointers.current.get(g.ids[1]);
      const rect = svgRef.current?.getBoundingClientRect();
      if (!a || !b || !rect) return;
      const scale = clampScale((g.s0 * dist(a, b)) / g.d0);
      const mid = midpoint(a, b);
      const cssK = rect.width / width;
      const sx = (mid.x - rect.left) / cssK - width / 2;
      const sy = (mid.y - rect.top) / cssK - height / 2;
      setView({ scale, center: { x: g.anchor.x - sx / scale, y: g.anchor.y - sy / scale } });
      return;
    }
    if (e.pointerId !== g.pointerId) return;

    if (g.kind === 'pan') {
      const dx = (e.clientX - g.startClient.x) / g.k;
      const dy = (e.clientY - g.startClient.y) / g.k;
      if (!g.moved && Math.hypot(dx, dy) * g.k < 4) return;
      g.moved = true;
      setView((v) => ({ ...v, center: { x: g.startCenter.x - dx, y: g.startCenter.y - dy } }));
      return;
    }

    const p = toWorld(e.clientX, e.clientY);
    if (!p) return;
    switch (g.kind) {
      case 'move': {
        const dx = p.x - g.start.x;
        const dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) * view.scale < 3) return;
        g.moved = true;
        dispatch({ type: 'update', id: g.id, update: () => translateItem(g.orig, dx, dy) });
        break;
      }
      case 'rotate':
        dispatch({
          type: 'update',
          id: g.id,
          update: (it) =>
            it.type === 'arrow' || it.type === 'impact'
              ? it
              : rotateItem(it, snap(bearing(p.x - it.x, p.y - it.y), e.shiftKey ? 1 : 5)),
        });
        break;
      case 'from':
      case 'to':
      case 'mid': {
        const o = g.orig;
        let next: ArrowItem;
        if (g.kind === 'mid')
          next = { ...o, ctrl: { x: 2 * p.x - (o.from.x + o.to.x) / 2, y: 2 * p.y - (o.from.y + o.to.y) / 2 } };
        else {
          const end = g.kind === 'from' ? o.from : o.to;
          const ctrl = { x: o.ctrl.x + (p.x - end.x) / 2, y: o.ctrl.y + (p.y - end.y) / 2 };
          next = { ...o, [g.kind]: p, ctrl };
        }
        g.last = next;
        dispatch({ type: 'update', id: g.id, update: () => next });
        break;
      }
      case 'draw':
        g.to = p;
        dispatch({
          type: 'update',
          id: g.id,
          update: (it) => (it.type === 'arrow' ? { ...it, to: p, ctrl: midpoint(it.from, p) } : it),
        });
        break;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>, cancelled = false) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (!g.ids.includes(e.pointerId)) return;
      gesture.current = null;
      return;
    }
    if (e.pointerId !== g.pointerId) return;
    gesture.current = null;

    if (g.kind === 'pan') {
      if (!g.moved && !cancelled) setSelectedId(null);
      return;
    }
    if (g.kind === 'draw') {
      if (cancelled || dist(g.from, g.to) * view.scale < 14) {
        dispatch({ type: 'gestureCancel' });
        setSelectedId(null);
        return;
      }
      alignVehicle({ ...createArrow(g.from, g.to, g.vehicleId), id: g.id });
      dispatch({ type: 'gestureEnd' });
      setTool('select');
      setArrowFor(null);
      const v = items.find((i) => i.id === g.vehicleId);
      setAnnouncement(
        `Arrow added${v && v.type === 'vehicle' ? ` for vehicle ${v.letter}` : ''}. Drag the diamond to bend it.`,
      );
      return;
    }
    if (!cancelled && (g.kind === 'from' || g.kind === 'to' || g.kind === 'mid') && g.last) alignVehicle(g.last);
    dispatch({ type: cancelled ? 'gestureCancel' : 'gestureEnd' });
  };

  /**
   * Points a vehicle along its first arrow, unless the customer has turned the
   * vehicle themselves (then we trust them, and may report REVERSING).
   */
  function alignVehicle(arrow: ArrowItem) {
    const vehicleId = arrow.vehicleId;
    if (!vehicleId) return;
    const first = latestItems.current.find((i) => isArrow(i) && i.vehicleId === vehicleId);
    if (first && first.id !== arrow.id) return;
    const heading = Math.round(arrowBearings(arrow).start);
    dispatch({
      type: 'update',
      id: vehicleId,
      update: (it) => (it.type === 'vehicle' && !it.headingSetByUser ? { ...it, heading } : it),
    });
  }

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer. Needs a non-passive listener.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const anchor = toWorld(e.clientX, e.clientY);
      if (!anchor) return;
      const f = Math.exp(-e.deltaY * 0.01);
      setView((v) => {
        const current = v.scale > 0 ? v.scale : latestAutoScale.current;
        const scale = clampScale(current * f);
        const r = current / scale;
        return {
          scale,
          center: { x: anchor.x - (anchor.x - v.center.x) * r, y: anchor.y - (anchor.y - v.center.y) * r },
        };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [setView, toWorld, latestAutoScale]);

  /* ------------------------------ keyboard ------------------------------- */

  const removeSelected = () => {
    if (!selected) return;
    dispatch({ type: 'remove', id: selected.id });
    setSelectedId(null);
    setAnnouncement('Removed from the sketch.');
  };

  const rotateSelected = (delta: number) => {
    if (!selected || selected.type === 'arrow' || selected.type === 'impact') return;
    dispatch({
      type: 'update',
      id: selected.id,
      update: (it) => (it.type === 'arrow' || it.type === 'impact' ? it : rotateItem(it, it.heading + delta)),
    });
  };

  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement | HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      dispatch({ type: 'redo' });
      return;
    }
    if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'Escape') {
      setTool('select');
      setArrowFor(null);
      setSelectedId(null);
      return;
    }
    if (!selected || !(e.target instanceof SVGElement)) return;
    const step = e.shiftKey ? 2 : 0.5;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      dispatch({ type: 'update', id: selected.id, update: (it) => translateItem(it, mv[0], mv[1]) });
    } else if (e.key === ']' || e.key === 'r') {
      e.preventDefault();
      rotateSelected(e.shiftKey ? 5 : 15);
    } else if (e.key === '[' || e.key === 'R') {
      e.preventDefault();
      rotateSelected(e.shiftKey ? -5 : -15);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
    }
  };

  /* ------------------------------- toolbar ------------------------------- */

  const zoom = (f: number) => setView((v) => ({ ...v, scale: clampScale(scaleOf(v) * f) }));
  const recentre = () =>
    setView(items.length ? fitView(items, width, height, view) : { center: { x: 0, y: 0 }, scale: autoScale });

  const startArrowFor = (vehicleId: string | null) => {
    setTool('arrow');
    setArrowFor(vehicleId);
    svgRef.current?.focus({ preventScroll: true });
  };

  const hint =
    tool === 'arrow'
      ? arrowFor
        ? `Drag on the sketch to draw vehicle ${(items.find((i) => i.id === arrowFor) as VehicleItem | undefined)?.letter ?? ''}'s path.`
        : 'Drag to draw an arrow. Start on a vehicle to link the arrow to it.'
      : null;

  return (
    <div className={styles.editor} onKeyDown={onKeyDown}>
      <div className={styles.toolbar} role="toolbar" aria-label="Sketch tools">
        <div className={styles.seg} role="group" aria-label="Tool">
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={tool === 'select'}
            onClick={() => {
              setTool('select');
              setArrowFor(null);
            }}
          >
            <Icon name="cursor" /> <span>Move</span>
          </button>
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={tool === 'arrow'}
            onClick={() =>
              tool === 'arrow' ? setTool('select') : startArrowFor(selected?.type === 'vehicle' ? selected.id : null)
            }
          >
            <Icon name="arrow" /> <span>Draw arrow</span>
          </button>
        </div>

        <div className={styles.toolGroup}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => dispatch({ type: 'undo' })}
            disabled={!history.past.length}
            aria-label="Undo"
            title="Undo (Ctrl/⌘+Z)"
          >
            <Icon name="undo" />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => dispatch({ type: 'redo' })}
            disabled={!history.future.length}
            aria-label="Redo"
            title="Redo (Ctrl/⌘+Shift+Z)"
          >
            <Icon name="redo" />
          </button>
        </div>

        <div className={styles.toolGroup}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => zoom(1 / 1.25)}
            disabled={view.scale <= MIN_SCALE}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Icon name="minus" />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => zoom(1.25)}
            disabled={view.scale >= MAX_SCALE}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Icon name="plus" />
          </button>
          <button type="button" className={styles.iconBtn} onClick={recentre} aria-label="Recentre" title="Recentre">
            <Icon name="target" />
          </button>
        </div>

        <div className={styles.seg} role="group" aria-label="Background">
          {mapLoading && (
            <button type="button" className={styles.segBtn} disabled aria-pressed={false}>
              <Icon name="map" /> <span>Loading map…</span>
            </button>
          )}
          {layers.map((l) => (
            <button
              key={l.id}
              type="button"
              className={styles.segBtn}
              aria-pressed={onMap && activeLayer?.id === l.id}
              onClick={() => {
                onSelectLayer(l.id);
                dispatch({ type: 'setBackdrop', backdrop: 'MAP' });
              }}
            >
              <Icon name={l.kind === 'satellite' ? 'satellite' : 'map'} /> <span>{l.label}</span>
            </button>
          ))}
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={!onMap && !mapLoading}
            onClick={() => dispatch({ type: 'setBackdrop', backdrop: 'SCHEMATIC' })}
          >
            <Icon name="road" /> <span>Road sketch</span>
          </button>
        </div>

        {!onMap && !mapLoading && (
          <div className={styles.toolGroup}>
            <label className={styles.srOnly} htmlFor={`${domId}-layout`}>
              Road layout
            </label>
            <select
              id={`${domId}-layout`}
              className={styles.select}
              value={diagram.layout}
              onChange={(e) => dispatch({ type: 'setLayout', layout: e.target.value as SchematicLayout })}
            >
              {(Object.keys(LAYOUT_LABELS) as SchematicLayout[]).map((l) => (
                <option key={l} value={l}>
                  {LAYOUT_LABELS[l]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => dispatch({ type: 'rotateLayout' })}
              aria-label="Rotate road layout"
              title="Rotate road layout"
            >
              <Icon name="rotateCw" />
            </button>
          </div>
        )}

        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost} ${styles.pushRight} ${styles.collapseLabel}`}
          onClick={() => dispatch({ type: 'clear' })}
          disabled={!items.length}
          title="Clear the sketch (you can undo)"
        >
          <Icon name="trash" /> <span>Clear all</span>
        </button>
      </div>

      <div
        className={styles.palette}
        aria-label="Things you can add. Drag onto the sketch, or tap to add in the middle."
      >
        <PaletteGroup title="Vehicles">
          {VEHICLE_ENTRIES.map((entry) => (
            <PaletteButton
              key={entry.label}
              entry={entry}
              disabled={entry.type === 'vehicle' && entry.role === 'POLICYHOLDER' && hasPolicyholder}
              onPointerDown={onPalettePointerDown}
              onClick={onPaletteClick}
            />
          ))}
        </PaletteGroup>
        <PaletteGroup title="Objects">
          {OBJECT_ENTRIES.map((entry) => (
            <PaletteButton
              key={entry.label}
              entry={entry}
              onPointerDown={onPalettePointerDown}
              onClick={onPaletteClick}
            />
          ))}
        </PaletteGroup>
        <PaletteGroup title="Marks">
          <PaletteButton entry={IMPACT_ENTRY} onPointerDown={onPalettePointerDown} onClick={onPaletteClick} />
        </PaletteGroup>
      </div>

      {mapFailed && (
        <p className={styles.notice} role="status">
          We couldn’t load a map for this spot, so you’re drawing on a road sketch. Pick the layout that looks most like
          where it happened.
        </p>
      )}

      <div className={styles.workspace}>
        <div ref={wrapRef} className={`${styles.canvasWrap} ${tool === 'arrow' ? styles.drawing : ''}`}>
          {hint && (
            <div className={styles.hint} role="status">
              <span>{hint}</span>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  setTool('select');
                  setArrowFor(null);
                }}
              >
                Cancel
              </button>
            </div>
          )}
          <DiagramScene
            width={width}
            height={height}
            diagram={diagram}
            view={view}
            origin={origin}
            layer={activeLayer}
            mapLoading={mapLoading}
            title="Accident sketch"
            selectedId={selectedId}
            onItemPointerDown={onItemPointerDown}
            onItemFocus={setSelectedId}
            svgRef={svgRef}
            worldRef={worldRef}
            svgProps={{
              className: styles.canvas,
              tabIndex: 0,
              role: 'application',
              'aria-label':
                'Accident sketch. Tab to each item; arrow keys move it, [ and ] rotate it, Delete removes it.',
              onPointerDown: onBackgroundPointerDown,
              onPointerMove,
              onPointerUp: (e) => onPointerUp(e),
              onPointerCancel: (e) => onPointerUp(e, true),
            }}
          />
        </div>

        <Inspector
          item={selected}
          items={items}
          dispatch={dispatch}
          onDelete={removeSelected}
          onRotate={rotateSelected}
          onDrawPath={startArrowFor}
        />
      </div>

      <div className={styles.srOnly} aria-live="polite">
        {announcement}
      </div>

      {ghost &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className={styles.ghost} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
            <PaletteIcon entry={ghost.entry} size={44} />
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

function PaletteGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.paletteGroup} role="group" aria-label={title}>
      <span className={styles.paletteTitle}>{title}</span>
      <div className={styles.paletteItems}>{children}</div>
    </div>
  );
}

function PaletteButton({
  entry,
  disabled,
  onPointerDown,
  onClick,
}: {
  entry: PaletteEntry;
  disabled?: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>, entry: PaletteEntry) => void;
  onClick: (entry: PaletteEntry) => void;
}) {
  return (
    <button
      type="button"
      className={styles.paletteItem}
      disabled={disabled}
      onPointerDown={(e) => onPointerDown(e, entry)}
      onClick={() => onClick(entry)}
      title={disabled ? 'Your vehicle is already on the sketch' : `Drag ${entry.label.toLowerCase()} onto the sketch`}
    >
      <PaletteIcon entry={entry} />
      <span>{entry.label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Inspector (properties of the selected item)                          */
/* ------------------------------------------------------------------ */

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
  isDisabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  isDisabled?: (v: T) => boolean;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.chipRow}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={styles.chip}
            aria-pressed={o.value === value}
            disabled={isDisabled?.(o.value)}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Inspector({
  item,
  items,
  dispatch,
  onDelete,
  onRotate,
  onDrawPath,
}: {
  item: DiagramItem | null;
  items: DiagramItem[];
  dispatch: Dispatch<DiagramAction>;
  onDelete: () => void;
  onRotate: (delta: number) => void;
  onDrawPath: (vehicleId: string | null) => void;
}) {
  if (!item) {
    return (
      <aside className={styles.inspector} aria-label="How to draw">
        <h3 className={styles.inspectorTitle}>Show us what happened</h3>
        <ol className={styles.howTo}>
          <li>
            Drag <strong>your vehicle</strong> and the <strong>other vehicle or object</strong> onto the sketch.
          </li>
          <li>Turn each one with its round handle so it faces the way it was pointing.</li>
          <li>
            Use <strong>Draw arrow</strong> to show how each vehicle moved. Start the arrow on the vehicle.
          </li>
          <li>
            Drop the red <strong>impact point</strong> where contact was made.
          </li>
        </ol>
        <p className={styles.muted}>Drag the background to move around. Tap an item to change it.</p>
      </aside>
    );
  }

  const actions = (extra?: ReactNode) => (
    <div className={styles.inspectorActions}>
      {extra}
      <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={onDelete}>
        <Icon name="trash" /> Remove
      </button>
    </div>
  );
  const rotateButtons = (
    <>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => onRotate(-15)}
        aria-label="Turn left 15 degrees"
        title="Turn left"
      >
        <Icon name="rotateCcw" />
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => onRotate(15)}
        aria-label="Turn right 15 degrees"
        title="Turn right"
      >
        <Icon name="rotateCw" />
      </button>
    </>
  );

  if (item.type === 'vehicle') {
    const v = item;
    const otherOwn = items.some((i) => isVehicle(i) && i.role === 'POLICYHOLDER' && i.id !== v.id);
    const patch = (update: (x: VehicleItem) => VehicleItem) =>
      dispatch({ type: 'update', id: v.id, update: (it) => (it.type === 'vehicle' ? update(it) : it) });
    return (
      <aside className={styles.inspector} aria-label={`Vehicle ${v.letter}`}>
        <h3 className={styles.inspectorTitle}>
          <span className={styles.swatch} style={{ background: vehicleColour(v.letter) }}>
            {v.letter}
          </span>
          {v.role === 'POLICYHOLDER' ? 'Your vehicle' : `Vehicle ${v.letter}`}
        </h3>
        <p className={styles.muted}>{vehicleLabel(v)}</p>
        <Chips
          label="Whose vehicle?"
          value={v.role}
          options={[
            { value: 'POLICYHOLDER', label: 'Mine' },
            { value: 'THIRD_PARTY', label: 'Someone else’s' },
          ]}
          isDisabled={(r) => r === 'POLICYHOLDER' && otherOwn}
          onChange={(role) =>
            patch((x) =>
              x.role === role
                ? x
                : {
                    ...x,
                    role,
                    letter: nextLetter(
                      items.filter((i) => i.id !== x.id),
                      role,
                    ),
                  },
            )
          }
        />
        <Chips
          label="Type"
          value={v.kind}
          options={(Object.keys(VEHICLE_SPECS) as VehicleKind[]).map((k) => ({
            value: k,
            label: VEHICLE_SPECS[k].label,
          }))}
          onChange={(kind) => patch((x) => ({ ...x, kind }))}
        />
        <Chips<VehicleMotion>
          label="At the moment of impact it was"
          value={v.motion}
          options={[
            { value: 'MOVING', label: 'Moving' },
            { value: 'STOPPED', label: 'Stopped' },
            { value: 'PARKED', label: 'Parked' },
          ]}
          onChange={(motion) => patch((x) => ({ ...x, motion }))}
        />
        {actions(
          <>
            {rotateButtons}
            <button type="button" className={styles.btn} onClick={() => onDrawPath(v.id)}>
              <Icon name="arrow" /> Draw its path
            </button>
          </>,
        )}
      </aside>
    );
  }

  if (item.type === 'object') {
    const o = item;
    const spec = OBJECT_SPECS[o.kind];
    const patch = (update: (x: ObjectItem) => ObjectItem) =>
      dispatch({ type: 'update', id: o.id, update: (it) => (it.type === 'object' ? update(it) : it) });
    return (
      <aside className={styles.inspector} aria-label={spec.label}>
        <h3 className={styles.inspectorTitle}>{spec.label}</h3>
        <Chips
          label="What was it?"
          value={o.kind}
          options={(Object.keys(OBJECT_SPECS) as ObjectKind[]).map((k) => ({ value: k, label: OBJECT_SPECS[k].label }))}
          onChange={(kind) => patch((x) => ({ ...x, kind, length: OBJECT_SPECS[kind].length }))}
        />
        {spec.linear && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Length</legend>
            <div className={styles.lengthStepper}>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Shorter"
                onClick={() => patch((x) => ({ ...x, length: Math.max(1, x.length - 1) }))}
              >
                <Icon name="minus" />
              </button>
              <output aria-live="polite">{o.length} m</output>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Longer"
                onClick={() => patch((x) => ({ ...x, length: Math.min(40, x.length + 1) }))}
              >
                <Icon name="plus" />
              </button>
            </div>
          </fieldset>
        )}
        {actions(rotateButtons)}
      </aside>
    );
  }

  if (item.type === 'arrow') {
    const a = item;
    const seq = items.filter(isArrow).findIndex((x) => x.id === a.id) + 1;
    const vehicles = items.filter(isVehicle);
    const patch = (update: (x: ArrowItem) => ArrowItem) =>
      dispatch({ type: 'update', id: a.id, update: (it) => (it.type === 'arrow' ? update(it) : it) });
    return (
      <aside className={styles.inspector} aria-label={`Movement ${seq}`}>
        <h3 className={styles.inspectorTitle}>Movement {seq}</h3>
        <p className={styles.muted}>Drag the round ends to move them and the diamond to bend the arrow.</p>
        <Chips
          label="Which vehicle made this move?"
          value={a.vehicleId ?? 'NONE'}
          options={[
            ...vehicles.map((v) => ({
              value: v.id,
              label: v.role === 'POLICYHOLDER' ? `${v.letter} (you)` : v.letter,
            })),
            { value: 'NONE', label: 'Not sure' },
          ]}
          onChange={(id) => patch((x) => ({ ...x, vehicleId: id === 'NONE' ? null : id }))}
        />
        {actions(
          <>
            <button
              type="button"
              className={styles.btn}
              onClick={() => patch((x) => ({ ...x, ctrl: midpoint(x.from, x.to) }))}
            >
              <Icon name="straighten" /> Straighten
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => patch((x) => ({ ...x, from: x.to, to: x.from }))}
            >
              <Icon name="swap" /> Reverse
            </button>
          </>,
        )}
      </aside>
    );
  }

  return (
    <aside className={styles.inspector} aria-label="Impact point">
      <h3 className={styles.inspectorTitle}>Impact point</h3>
      <p className={styles.muted}>
        Drag the star to where the vehicles or objects touched. Add more if there was more than one impact.
      </p>
      {actions()}
    </aside>
  );
}

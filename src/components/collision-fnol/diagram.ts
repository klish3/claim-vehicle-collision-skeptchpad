import type { BackdropMode, ObjectKind, PartyRole, SchematicLayout, VehicleKind, VehicleMotion } from './types';

/**
 * Internal diagram model. All positions are metres in SVG space:
 * x = east (right), y = SOUTH (down). Headings are degrees clockwise
 * from up. The payload builder flips y to north-up for the back end.
 */
export interface Vec {
  x: number;
  y: number;
}

export interface VehicleItem {
  id: string;
  type: 'vehicle';
  letter: string;
  role: PartyRole;
  kind: VehicleKind;
  motion: VehicleMotion;
  x: number;
  y: number;
  heading: number;
  headingSetByUser: boolean;
}

export interface ObjectItem {
  id: string;
  type: 'object';
  kind: ObjectKind;
  x: number;
  y: number;
  heading: number;
  /** Only varies for linear objects (wall, fence, barrier). */
  length: number;
}

export interface ArrowItem {
  id: string;
  type: 'arrow';
  vehicleId: string | null;
  from: Vec;
  to: Vec;
  /** Quadratic Bézier control point. Equal to the midpoint for a straight arrow. */
  ctrl: Vec;
}

export interface ImpactItem {
  id: string;
  type: 'impact';
  x: number;
  y: number;
}

export type DiagramItem = VehicleItem | ObjectItem | ArrowItem | ImpactItem;
export type PlacedItem = VehicleItem | ObjectItem;

export interface Diagram {
  backdrop: BackdropMode;
  layout: SchematicLayout;
  layoutRotation: number;
  items: DiagramItem[];
}

export interface View {
  center: Vec;
  /** Screen pixels per metre. */
  scale: number;
}

export const MIN_SCALE = 2;
export const MAX_SCALE = 32;

/* ------------------------------------------------------------------ */
/* Specs                                                               */
/* ------------------------------------------------------------------ */

export const VEHICLE_SPECS: Record<VehicleKind, { length: number; width: number; label: string }> = {
  CAR: { length: 4.5, width: 1.85, label: 'Car' },
  VAN: { length: 5.4, width: 2.05, label: 'Van' },
  MOTORCYCLE: { length: 2.1, width: 0.8, label: 'Motorbike' },
  BICYCLE: { length: 1.8, width: 0.6, label: 'Bicycle' },
  LORRY: { length: 10, width: 2.5, label: 'Lorry' },
  BUS: { length: 12, width: 2.55, label: 'Bus' },
};

export const OBJECT_SPECS: Record<ObjectKind, { length: number; width: number; label: string; linear: boolean }> = {
  WALL: { length: 5, width: 0.5, label: 'Wall', linear: true },
  FENCE: { length: 5, width: 0.25, label: 'Fence', linear: true },
  BARRIER: { length: 6, width: 0.35, label: 'Barrier', linear: true },
  LAMP_POST: { length: 0.5, width: 0.5, label: 'Lamp post', linear: false },
  BOLLARD: { length: 0.45, width: 0.45, label: 'Bollard', linear: false },
  SIGN: { length: 0.9, width: 0.9, label: 'Sign', linear: false },
  TREE: { length: 4, width: 4, label: 'Tree', linear: false },
  ANIMAL: { length: 1.6, width: 0.7, label: 'Animal', linear: false },
  OTHER: { length: 1.5, width: 1.5, label: 'Other object', linear: false },
};

export const LAYOUT_LABELS: Record<SchematicLayout, string> = {
  CROSSROADS: 'Crossroads',
  T_JUNCTION: 'T-junction',
  ROUNDABOUT: 'Roundabout',
  STRAIGHT_ROAD: 'Straight road',
  DUAL_CARRIAGEWAY: 'Dual carriageway',
  CAR_PARK: 'Car park',
  BLANK: 'Blank',
};

const THIRD_PARTY_COLOURS = ['#c2410c', '#7e22ce', '#0f766e', '#be185d', '#a16207', '#4d7c0f', '#0e7490'];
export const POLICYHOLDER_COLOUR = '#1d4ed8';
export const UNLINKED_ARROW_COLOUR = '#1f2937';

export function vehicleColour(letter: string): string {
  if (letter === 'A') return POLICYHOLDER_COLOUR;
  const i = (letter.charCodeAt(0) - 66) % THIRD_PARTY_COLOURS.length;
  return THIRD_PARTY_COLOURS[Math.max(0, i)] ?? THIRD_PARTY_COLOURS[0]!;
}

/** Half extents of an item's footprint in its own (unrotated) frame. */
export function footprint(item: PlacedItem): { hx: number; hy: number } {
  if (item.type === 'vehicle') {
    const s = VEHICLE_SPECS[item.kind];
    return { hx: s.width / 2, hy: s.length / 2 };
  }
  const s = OBJECT_SPECS[item.kind];
  return s.linear ? { hx: item.length / 2, hy: s.width / 2 } : { hx: s.width / 2, hy: s.length / 2 };
}

/* ------------------------------------------------------------------ */
/* Factories                                                           */
/* ------------------------------------------------------------------ */

export function uid(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nextLetter(items: DiagramItem[], role: PartyRole): string {
  if (role === 'POLICYHOLDER') return 'A';
  const used = new Set(items.filter(isVehicle).map((v) => v.letter));
  for (let c = 66; c <= 90; c++) {
    const l = String.fromCharCode(c);
    if (!used.has(l)) return l;
  }
  return '?';
}

export function createVehicle(items: DiagramItem[], role: PartyRole, kind: VehicleKind, at: Vec): VehicleItem {
  return {
    id: uid(),
    type: 'vehicle',
    letter: nextLetter(items, role),
    role,
    kind,
    motion: 'MOVING',
    x: at.x,
    y: at.y,
    heading: 0,
    headingSetByUser: false,
  };
}

export function createObject(kind: ObjectKind, at: Vec): ObjectItem {
  return { id: uid(), type: 'object', kind, x: at.x, y: at.y, heading: 0, length: OBJECT_SPECS[kind].length };
}

export function createImpact(at: Vec): ImpactItem {
  return { id: uid(), type: 'impact', x: at.x, y: at.y };
}

export function createArrow(from: Vec, to: Vec, vehicleId: string | null): ArrowItem {
  return { id: uid(), type: 'arrow', vehicleId, from, to, ctrl: midpoint(from, to) };
}

export const isVehicle = (i: DiagramItem): i is VehicleItem => i.type === 'vehicle';
export const isObject = (i: DiagramItem): i is ObjectItem => i.type === 'object';
export const isArrow = (i: DiagramItem): i is ArrowItem => i.type === 'arrow';
export const isImpact = (i: DiagramItem): i is ImpactItem => i.type === 'impact';

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export const midpoint = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Degrees clockwise from up (north) for a vector in SVG space. */
export function bearing(dx: number, dy: number): number {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return normalise360(deg);
}

export const normalise360 = (d: number): number => ((d % 360) + 360) % 360;

/** Maps any angle to (-180, 180]. */
export function normalise180(d: number): number {
  const n = normalise360(d);
  return n > 180 ? n - 360 : n;
}

export function quadPoint(a: ArrowItem, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * a.from.x + 2 * u * t * a.ctrl.x + t * t * a.to.x,
    y: u * u * a.from.y + 2 * u * t * a.ctrl.y + t * t * a.to.y,
  };
}

export function arrowLength(a: ArrowItem, segments = 32): number {
  let len = 0;
  let prev = a.from;
  for (let i = 1; i <= segments; i++) {
    const p = quadPoint(a, i / segments);
    len += dist(prev, p);
    prev = p;
  }
  return len;
}

export function arrowBearings(a: ArrowItem): { start: number; end: number } {
  const straight = dist(a.ctrl, midpoint(a.from, a.to)) < 0.05;
  const s = straight || dist(a.from, a.ctrl) < 0.05 ? a.to : a.ctrl;
  const e = straight || dist(a.to, a.ctrl) < 0.05 ? a.from : a.ctrl;
  return {
    start: bearing(s.x - a.from.x, s.y - a.from.y),
    end: bearing(a.to.x - e.x, a.to.y - e.y),
  };
}

function corners(item: PlacedItem): Vec[] {
  const { hx, hy } = footprint(item);
  const r = (item.heading * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ].map(([lx, ly]) => ({ x: item.x + lx! * c - ly! * s, y: item.y + lx! * s + ly! * c }));
}

/** Distance from a point to an item's rotated footprint (0 when inside). */
export function pointToItemDistance(p: Vec, item: PlacedItem): number {
  const { hx, hy } = footprint(item);
  const r = (-item.heading * Math.PI) / 180;
  const dx = p.x - item.x;
  const dy = p.y - item.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(ly) - hy, 0));
}

/** Exact gap between two rotated rectangles (0 when they overlap). */
export function itemGap(a: PlacedItem, b: PlacedItem): number {
  const ca = corners(a);
  const cb = corners(b);
  const axes: Vec[] = [];
  for (const poly of [ca, cb]) {
    for (let i = 0; i < 2; i++) {
      const p = poly[i]!;
      const q = poly[i + 1]!;
      const len = dist(p, q) || 1;
      axes.push({ x: -(q.y - p.y) / len, y: (q.x - p.x) / len });
    }
  }
  const separated = axes.some((ax) => {
    const pa = ca.map((p) => p.x * ax.x + p.y * ax.y);
    const pb = cb.map((p) => p.x * ax.x + p.y * ax.y);
    return Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa);
  });
  if (!separated) return 0;
  return Math.min(...ca.map((p) => pointToItemDistance(p, b)), ...cb.map((p) => pointToItemDistance(p, a)));
}

/** Finds the top-most vehicle under a point, with a little finger-friendly slack. */
export function vehicleAt(items: DiagramItem[], p: Vec, slack = 0.5): VehicleItem | undefined {
  return [...items].reverse().find((i): i is VehicleItem => isVehicle(i) && pointToItemDistance(p, i) <= slack);
}

/** A free spot near the centre so repeated taps don't stack items on top of each other. */
export function freeSpotNear(items: DiagramItem[], center: Vec): Vec {
  const occupied = items.filter((i): i is PlacedItem | ImpactItem => i.type !== 'arrow');
  const offsets: Vec[] = [{ x: 0, y: 0 }];
  for (let ring = 1; ring <= 4; ring++) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      offsets.push({ x: Math.cos(a) * ring * 7, y: Math.sin(a) * ring * 7 });
    }
  }
  for (const o of offsets) {
    const p = { x: center.x + o.x, y: center.y + o.y };
    if (occupied.every((i) => Math.hypot(i.x - p.x, i.y - p.y) > 5)) return p;
  }
  return center;
}

export function fitView(items: DiagramItem[], width: number, height: number, fallback: View): View {
  const pts: Vec[] = [];
  for (const i of items) {
    if (i.type === 'arrow') pts.push(i.from, i.to, quadPoint(i, 0.5));
    else if (i.type === 'impact') pts.push({ x: i.x, y: i.y });
    else pts.push(...corners(i));
  }
  if (!pts.length) return fallback;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const pad = 10;
  const scale = Math.min(width / (maxX - minX + pad * 2), height / (maxY - minY + pad * 2));
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    scale: Math.max(MIN_SCALE, Math.min(16, scale)),
  };
}

/* ------------------------------------------------------------------ */
/* State + undo history                                                */
/* ------------------------------------------------------------------ */

export interface History {
  past: Diagram[];
  present: Diagram;
  future: Diagram[];
  /** Snapshot taken at the start of a drag, so one drag = one undo step. */
  gesture: Diagram | null;
}

export type DiagramAction =
  | { type: 'add'; item: DiagramItem }
  | { type: 'update'; id: string; update: (item: DiagramItem, items: DiagramItem[]) => DiagramItem }
  | { type: 'remove'; id: string }
  | { type: 'setBackdrop'; backdrop: BackdropMode }
  | { type: 'setLayout'; layout: SchematicLayout }
  | { type: 'rotateLayout' }
  | { type: 'clear' }
  | { type: 'reset'; backdrop: BackdropMode }
  | { type: 'gestureStart' }
  | { type: 'gestureEnd' }
  | { type: 'gestureCancel' }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 100;

export function initHistory(backdrop: BackdropMode): History {
  return {
    past: [],
    present: { backdrop, layout: 'CROSSROADS', layoutRotation: 0, items: [] },
    future: [],
    gesture: null,
  };
}

function commit(h: History, next: Diagram): History {
  if (next === h.present) return h;
  if (h.gesture) return { ...h, present: next };
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], gesture: null };
}

export function historyReducer(h: History, action: DiagramAction): History {
  const d = h.present;
  switch (action.type) {
    case 'add':
      return commit(h, { ...d, items: [...d.items, action.item] });
    case 'update': {
      let changed = false;
      const items = d.items.map((i) => {
        if (i.id !== action.id) return i;
        const next = action.update(i, d.items);
        if (next !== i) changed = true;
        return next;
      });
      return changed ? commit(h, { ...d, items }) : h;
    }
    case 'remove': {
      // Removing a vehicle removes the arrows that describe its movement.
      const items = d.items.filter((i) => i.id !== action.id && !(isArrow(i) && i.vehicleId === action.id));
      return items.length === d.items.length ? h : commit(h, { ...d, items });
    }
    case 'setBackdrop':
      return d.backdrop === action.backdrop ? h : commit(h, { ...d, backdrop: action.backdrop });
    case 'setLayout':
      return d.layout === action.layout ? h : commit(h, { ...d, layout: action.layout, backdrop: 'SCHEMATIC' });
    case 'rotateLayout':
      return commit(h, { ...d, layoutRotation: (d.layoutRotation + 90) % 360 });
    case 'clear':
      return d.items.length ? commit(h, { ...d, items: [] }) : h;
    case 'reset':
      return initHistory(action.backdrop);
    case 'gestureStart':
      return { ...h, gesture: h.present };
    case 'gestureEnd':
      if (!h.gesture) return h;
      if (h.gesture === h.present) return { ...h, gesture: null };
      return { past: [...h.past, h.gesture].slice(-HISTORY_LIMIT), present: h.present, future: [], gesture: null };
    case 'gestureCancel':
      return h.gesture ? { ...h, present: h.gesture, gesture: null } : h;
    case 'undo': {
      const prev = h.past[h.past.length - 1];
      if (!prev) return h;
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], gesture: null };
    }
    case 'redo': {
      const [next, ...rest] = h.future;
      if (!next) return h;
      return { past: [...h.past, h.present], present: next, future: rest, gesture: null };
    }
  }
}

import {
  OBJECT_SPECS,
  VEHICLE_SPECS,
  arrowBearings,
  arrowLength,
  footprint,
  isArrow,
  isImpact,
  isObject,
  isVehicle,
  itemGap,
  normalise180,
  pointToItemDistance,
  type ArrowItem,
  type Diagram,
  type PlacedItem,
  type VehicleItem,
} from './diagram';
import { offsetToLatLng, type MapLayer } from './geo';
import type {
  CollisionFnolPayload,
  CollisionWith,
  IncidentLocation,
  LatLng,
  Manoeuvre,
  PayloadContact,
  PayloadMovement,
  Point,
} from './types';

export const COMPONENT_VERSION = '1.0.0';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r7 = (n: number) => Math.round(n * 1e7) / 1e7;
const deg = (n: number) => ((Math.round(n) % 360) + 360) % 360;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
const COMPASS_WORDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const SKETCH_WORDS = ['up', 'up and right', 'right', 'down and right', 'down', 'down and left', 'left', 'up and left'];

export const compass = (d: number): string => COMPASS[Math.round(deg(d) / 45) % 8]!;

const MANOEUVRE_WORDS: Record<Manoeuvre, string> = {
  STRAIGHT: 'going straight',
  BEAR_LEFT: 'bearing left',
  BEAR_RIGHT: 'bearing right',
  LEFT_TURN: 'turning left',
  RIGHT_TURN: 'turning right',
  U_TURN: 'making a U-turn',
  REVERSING: 'reversing',
};

/** Accessible name used on the canvas and in the inspector. */
export function vehicleLabel(v: VehicleItem): string {
  const whose = v.role === 'POLICYHOLDER' ? 'your' : 'other';
  return `Vehicle ${v.letter}, ${whose} ${VEHICLE_SPECS[v.kind].label.toLowerCase()}, facing ${compass(v.heading)}`;
}

export function classifyManoeuvre(turnDeg: number): Manoeuvre {
  const a = Math.abs(turnDeg);
  if (a < 15) return 'STRAIGHT';
  if (a >= 150) return 'U_TURN';
  if (a < 55) return turnDeg > 0 ? 'BEAR_RIGHT' : 'BEAR_LEFT';
  return turnDeg > 0 ? 'RIGHT_TURN' : 'LEFT_TURN';
}

export function describeMovement(arrow: ArrowItem, vehicle: VehicleItem | undefined) {
  const { start, end } = arrowBearings(arrow);
  const turnDeg = normalise180(end - start);
  let manoeuvre = classifyManoeuvre(turnDeg);
  // Only call it reversing when the customer deliberately pointed the vehicle the other way.
  if (vehicle?.headingSetByUser && Math.abs(normalise180(start - vehicle.heading)) > 120) manoeuvre = 'REVERSING';
  return { start, end, turnDeg, manoeuvre, lengthM: arrowLength(arrow) };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

export function validate(diagram: Diagram, location: IncidentLocation | null, occurredAt: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const vehicles = diagram.items.filter(isVehicle);
  const own = vehicles.find((v) => v.role === 'POLICYHOLDER');
  const others = vehicles.filter((v) => v.role === 'THIRD_PARTY');
  const objects = diagram.items.filter(isObject);
  const arrows = diagram.items.filter(isArrow);

  if (!location) issues.push({ level: 'error', message: 'Tell us where the accident happened.' });
  if (!own) issues.push({ level: 'error', message: 'Add your vehicle to the sketch.' });
  if (!others.length && !objects.length)
    issues.push({ level: 'error', message: 'Add the other vehicle, or the object you hit.' });
  if (!arrows.length)
    issues.push({ level: 'warning', message: 'No arrows yet. Arrows show which way each vehicle was going.' });
  if (own?.motion === 'MOVING' && !arrows.some((a) => a.vehicleId === own.id))
    issues.push({ level: 'warning', message: 'Your vehicle is marked as moving but has no arrow.' });
  if (!diagram.items.some(isImpact))
    issues.push({ level: 'warning', message: 'No impact point. Mark where the vehicles or objects made contact.' });
  if (!occurredAt) issues.push({ level: 'warning', message: 'You haven’t said when it happened.' });
  return issues;
}

/* ------------------------------------------------------------------ */
/* Payload                                                             */
/* ------------------------------------------------------------------ */

export interface BuildPayloadInput {
  diagram: Diagram;
  location: IncidentLocation;
  occurredAt: string;
  clientSubmissionId: string;
  /** The tile layer the customer drew on, or null if no map was shown. */
  mapLayer: MapLayer | null;
  snapshotSvg: string | null;
  now?: Date;
}

/** True when the customer drew on real map tiles (so positions are geo-referenced). */
export function drawnOnMap(diagram: Diagram, location: IncidentLocation | null, mapLayer: MapLayer | null): boolean {
  return diagram.backdrop === 'MAP' && !!location?.coordinates && !!mapLayer;
}

/** Only the host is reported, so API keys in tile URLs never reach the payload. */
function tileHost(layer: MapLayer): string | null {
  try {
    return new URL(layer.url(0, 0, 0)).host;
  } catch {
    return null;
  }
}

export function buildPayload(input: BuildPayloadInput): CollisionFnolPayload {
  const { diagram, location, mapLayer } = input;
  const onMap = drawnOnMap(diagram, location, mapLayer);
  const origin = onMap ? location.coordinates : null;

  const pt = (x: number, y: number): Point => ({ x: r2(x), y: r2(-y) });
  const ll = (x: number, y: number): LatLng | null => {
    if (!origin) return null;
    const p = offsetToLatLng(origin, x, y);
    return { lat: r7(p.lat), lng: r7(p.lng) };
  };

  const vehicles = diagram.items.filter(isVehicle);
  const objects = diagram.items.filter(isObject);
  const arrows = diagram.items.filter(isArrow);
  const impacts = diagram.items.filter(isImpact);

  // Public ids: vehicles keep their sketch letter; everything else gets a short readable id.
  const publicId = new Map<string, string>();
  vehicles.forEach((v) => publicId.set(v.id, v.letter));
  objects.forEach((o, i) => publicId.set(o.id, `O${i + 1}`));
  arrows.forEach((a, i) => publicId.set(a.id, `M${i + 1}`));
  impacts.forEach((x, i) => publicId.set(x.id, `X${i + 1}`));
  const pid = (id: string) => publicId.get(id) ?? id;

  const movements: PayloadMovement[] = arrows.map((a, i) => {
    const vehicle = vehicles.find((v) => v.id === a.vehicleId);
    const m = describeMovement(a, vehicle);
    return {
      id: pid(a.id),
      sequence: i + 1,
      vehicleId: vehicle ? vehicle.letter : null,
      path: { from: pt(a.from.x, a.from.y), control: pt(a.ctrl.x, a.ctrl.y), to: pt(a.to.x, a.to.y) },
      fromLatLng: ll(a.from.x, a.from.y),
      toLatLng: ll(a.to.x, a.to.y),
      lengthM: r2(m.lengthM),
      startBearingDeg: deg(m.start),
      endBearingDeg: deg(m.end),
      turnDeg: Math.round(m.turnDeg),
      manoeuvre: m.manoeuvre,
    };
  });

  const placed: PlacedItem[] = [...vehicles, ...objects];
  const contacts: PayloadContact[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (a.type === 'object' && b.type === 'object') continue;
      const gap = itemGap(a, b);
      if (gap <= 0.5) contacts.push({ itemIds: [pid(a.id), pid(b.id)], gapM: r2(gap) });
    }
  }

  const third = vehicles.some((v) => v.role === 'THIRD_PARTY');
  const collisionWith: CollisionWith =
    third && objects.length ? 'VEHICLE_AND_OBJECT' : third ? 'VEHICLE' : objects.length ? 'OBJECT' : 'UNKNOWN';

  const warnings = validate(diagram, location, input.occurredAt)
    .filter((i) => i.level === 'warning')
    .map((i) => i.message);

  return {
    schemaVersion: '1.0',
    kind: 'MOTOR_COLLISION_FNOL',
    clientSubmissionId: input.clientSubmissionId,
    createdAt: (input.now ?? new Date()).toISOString(),
    incident: {
      occurredAt: input.occurredAt || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      collisionWith,
      location,
      summary: summarise(diagram, location, onMap, pid),
    },
    diagram: {
      backdrop: {
        mode: onMap ? 'MAP' : 'SCHEMATIC',
        layout: onMap ? null : diagram.layout,
        layoutRotationDeg: onMap ? 0 : diagram.layoutRotation,
        mapLayer: onMap && mapLayer ? mapLayer.id : null,
        tileSource: onMap && mapLayer ? tileHost(mapLayer) : null,
      },
      frame: {
        origin: origin ? { lat: r7(origin.lat), lng: r7(origin.lng) } : null,
        units: 'metres',
        axes: 'x=east,y=north',
        headingReference: onMap ? 'TRUE_NORTH' : 'DIAGRAM_UP',
      },
      vehicles: vehicles.map((v) => ({
        id: v.letter,
        role: v.role,
        kind: v.kind,
        motion: v.motion,
        position: pt(v.x, v.y),
        latLng: ll(v.x, v.y),
        headingDeg: deg(v.heading),
        headingCompass: compass(v.heading),
        headingSetByUser: v.headingSetByUser,
        lengthM: VEHICLE_SPECS[v.kind].length,
        widthM: VEHICLE_SPECS[v.kind].width,
        movementIds: arrows.filter((a) => a.vehicleId === v.id).map((a) => pid(a.id)),
      })),
      objects: objects.map((o) => {
        const { hx, hy } = footprint(o);
        return {
          id: pid(o.id),
          kind: o.kind,
          position: pt(o.x, o.y),
          latLng: ll(o.x, o.y),
          headingDeg: deg(o.heading),
          lengthM: r2(Math.max(hx, hy) * 2),
          widthM: r2(Math.min(hx, hy) * 2),
        };
      }),
      movements,
      impactPoints: impacts.map((x) => ({
        id: pid(x.id),
        position: pt(x.x, x.y),
        latLng: ll(x.x, x.y),
        nearItemIds: placed.filter((p) => pointToItemDistance(x, p) <= 2).map((p) => pid(p.id)),
      })),
      contacts,
      snapshotSvg: input.snapshotSvg,
    },
    validation: { warnings },
    client: {
      component: 'CollisionFnol',
      version: COMPONENT_VERSION,
      locale: typeof navigator !== 'undefined' ? navigator.language : 'en-GB',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Plain-English summary                                               */
/* ------------------------------------------------------------------ */

export function summarise(
  diagram: Diagram,
  location: IncidentLocation | null,
  onMap: boolean,
  pid: (id: string) => string = (i) => i,
): string[] {
  const words = onMap ? COMPASS_WORDS : SKETCH_WORDS;
  const dir = (d: number) => words[Math.round(deg(d) / 45) % 8]!;
  const facing = (d: number) => (onMap ? `facing ${dir(d)}` : `pointing ${dir(d)} on the sketch`);
  const lines: string[] = [];

  if (location) {
    const where = onMap ? 'drawn on the map' : `drawn on a ${diagram.layout.toLowerCase().replace(/_/g, ' ')} sketch`;
    lines.push(`Location: ${location.label} (${where}).`);
  }

  const vehicles = diagram.items.filter(isVehicle);
  for (const v of vehicles) {
    const who = v.role === 'POLICYHOLDER' ? 'your' : 'other';
    const kind = VEHICLE_SPECS[v.kind].label.toLowerCase();
    const motion = v.motion === 'MOVING' ? 'moving' : v.motion === 'STOPPED' ? 'stopped' : 'parked';
    lines.push(`Vehicle ${v.letter} (${who} ${kind}): ${motion}, ${facing(v.heading)}.`);
  }

  diagram.items.filter(isObject).forEach((o) => {
    lines.push(`Object ${pid(o.id)}: ${OBJECT_SPECS[o.kind].label.toLowerCase()}.`);
  });

  diagram.items.filter(isArrow).forEach((a, i) => {
    const v = vehicles.find((x) => x.id === a.vehicleId);
    const m = describeMovement(a, v);
    const subject = v ? `Vehicle ${v.letter}` : 'Unassigned arrow';
    lines.push(
      `Movement ${i + 1}: ${subject} ${MANOEUVRE_WORDS[m.manoeuvre]}, about ${Math.max(1, Math.round(m.lengthM))} m, heading ${dir(m.end)}.`,
    );
  });

  const placed: PlacedItem[] = [...vehicles, ...diagram.items.filter(isObject)];
  const name = (p: PlacedItem) =>
    p.type === 'vehicle' ? `vehicle ${p.letter}` : OBJECT_SPECS[p.kind].label.toLowerCase();
  diagram.items.filter(isImpact).forEach((x, i) => {
    const near = placed.filter((p) => pointToItemDistance(x, p) <= 2).map(name);
    const where =
      near.length > 1
        ? `between ${listOf(near)}`
        : near.length === 1
          ? `on ${near[0]}`
          : 'not next to anything on the sketch';
    lines.push(`Impact point ${i + 1}: ${where}.`);
  });

  return lines;
}

function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

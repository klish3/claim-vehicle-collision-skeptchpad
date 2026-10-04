import { describe, expect, it } from 'vitest';
import {
  createArrow,
  createImpact,
  createObject,
  createVehicle,
  historyReducer,
  initHistory,
  itemGap,
  type Diagram,
  type DiagramItem,
} from './diagram';
import { esriStreetsLayer, offsetToLatLng, osMapsLayer } from './geo';
import { buildPayload, classifyManoeuvre, validate } from './payload';
import type { IncidentLocation } from './types';

const location: IncidentLocation = {
  source: 'SEARCH',
  query: 'High Street Guildford',
  label: 'High Street, Guildford, GU1 3AA',
  coordinates: { lat: 51.2362, lng: -0.5704 },
};

function diagramWith(items: DiagramItem[], backdrop: Diagram['backdrop'] = 'MAP'): Diagram {
  return { backdrop, layout: 'CROSSROADS', layoutRotation: 0, items };
}

describe('classifyManoeuvre', () => {
  it.each([
    [0, 'STRAIGHT'],
    [10, 'STRAIGHT'],
    [30, 'BEAR_RIGHT'],
    [-30, 'BEAR_LEFT'],
    [90, 'RIGHT_TURN'],
    [-90, 'LEFT_TURN'],
    [170, 'U_TURN'],
    [-179, 'U_TURN'],
  ] as const)('%d° → %s', (turn, expected) => {
    expect(classifyManoeuvre(turn)).toBe(expected);
  });
});

describe('geometry', () => {
  it('converts local metres to lat/lng', () => {
    const p = offsetToLatLng(location.coordinates!, 0, -111.32); // 111 m north
    expect(p.lat - location.coordinates!.lat).toBeCloseTo(0.001, 5);
    expect(p.lng).toBeCloseTo(location.coordinates!.lng, 9);
  });

  it('measures the gap between rotated footprints', () => {
    const a = createVehicle([], 'POLICYHOLDER', 'CAR', { x: 0, y: 0 });
    const b = { ...createVehicle([a], 'THIRD_PARTY', 'CAR', { x: 3, y: 0 }) };
    expect(itemGap(a, b)).toBeCloseTo(3 - 1.85, 5); // side by side
    const c = { ...b, x: 1, heading: 90 };
    expect(itemGap(a, c)).toBe(0); // overlapping
  });
});

describe('buildPayload', () => {
  const own = { ...createVehicle([], 'POLICYHOLDER', 'CAR', { x: 0, y: 3 }), heading: 0 };
  const other = { ...createVehicle([own], 'THIRD_PARTY', 'VAN', { x: 3.6, y: 0 }), heading: 270 };
  // Own car goes north then turns right (east): control point at the corner.
  const turn = { ...createArrow({ x: 0, y: 10 }, { x: 10, y: 0 }, own.id), ctrl: { x: 0, y: 0 } };
  const straight = createArrow({ x: 12, y: 0 }, { x: 2, y: 0 }, other.id);
  const wall = createObject('WALL', { x: 0, y: -8 });
  const impact = createImpact({ x: 0.9, y: 0.9 });
  const diagram = diagramWith([own, other, turn, straight, wall, impact]);

  const payload = buildPayload({
    diagram,
    location,
    occurredAt: '2026-09-25T17:40',
    clientSubmissionId: 'test-id',
    mapLayer: esriStreetsLayer(),
    snapshotSvg: null,
    now: new Date('2026-09-26T09:00:00Z'),
  });

  it('uses public ids and north-up coordinates', () => {
    expect(payload.diagram.vehicles.map((v) => v.id)).toEqual(['A', 'B']);
    expect(payload.diagram.vehicles[0]!.position).toEqual({ x: 0, y: -3 });
    expect(payload.diagram.objects[0]!.id).toBe('O1');
    expect(payload.diagram.movements.map((m) => m.id)).toEqual(['M1', 'M2']);
    expect(payload.diagram.frame.headingReference).toBe('TRUE_NORTH');
    expect(payload.diagram.vehicles[0]!.latLng?.lat).toBeLessThan(location.coordinates!.lat);
  });

  it('derives manoeuvres, bearings and lengths', () => {
    const [m1, m2] = payload.diagram.movements;
    expect(m1!.manoeuvre).toBe('RIGHT_TURN');
    expect(m1!.startBearingDeg).toBe(0);
    expect(m1!.endBearingDeg).toBe(90);
    expect(m1!.vehicleId).toBe('A');
    expect(m2!.manoeuvre).toBe('STRAIGHT');
    expect(m2!.startBearingDeg).toBe(270);
    expect(m2!.lengthM).toBeCloseTo(10, 1);
  });

  it('flags reversing only when the customer set the heading themselves', () => {
    const reversing = { ...own, heading: 180, headingSetByUser: true };
    const p = buildPayload({
      diagram: diagramWith([reversing, turn]),
      location,
      occurredAt: '',
      clientSubmissionId: 'x',
      mapLayer: esriStreetsLayer(),
      snapshotSvg: null,
    });
    expect(p.diagram.movements[0]!.manoeuvre).toBe('REVERSING');
  });

  it('links the impact point to nearby vehicles and summarises', () => {
    expect(payload.diagram.impactPoints[0]!.nearItemIds.sort()).toEqual(['A', 'B']);
    expect(payload.incident.collisionWith).toBe('VEHICLE_AND_OBJECT');
    expect(payload.incident.summary.some((l) => l.includes('Vehicle A (your car)'))).toBe(true);
    expect(payload.incident.summary.some((l) => l.includes('turning right'))).toBe(true);
  });

  it('drops real-world coordinates on a schematic sketch', () => {
    const p = buildPayload({
      diagram: diagramWith([own], 'SCHEMATIC'),
      location,
      occurredAt: '',
      clientSubmissionId: 'x',
      mapLayer: esriStreetsLayer(),
      snapshotSvg: null,
    });
    expect(p.diagram.frame.origin).toBeNull();
    expect(p.diagram.vehicles[0]!.latLng).toBeNull();
    expect(p.diagram.frame.headingReference).toBe('DIAGRAM_UP');
    expect(p.diagram.backdrop.tileSource).toBeNull();
  });

  it('falls back to sketch semantics when no map layer could be shown', () => {
    const p = buildPayload({
      diagram: diagramWith([own]),
      location,
      occurredAt: '',
      clientSubmissionId: 'x',
      mapLayer: null,
      snapshotSvg: null,
    });
    expect(p.diagram.backdrop.mode).toBe('SCHEMATIC');
    expect(p.diagram.vehicles[0]!.latLng).toBeNull();
    expect(p.incident.summary[0]).toContain('sketch');
  });

  it('never leaks a tile API key into the payload', () => {
    const p = buildPayload({
      diagram: diagramWith([own]),
      location,
      occurredAt: '',
      clientSubmissionId: 'x',
      mapLayer: osMapsLayer({ apiKey: 'SECRET123' }),
      snapshotSvg: null,
    });
    expect(p.diagram.backdrop).toMatchObject({ mode: 'MAP', mapLayer: 'os-road', tileSource: 'api.os.uk' });
    expect(JSON.stringify(p)).not.toContain('SECRET123');
  });

  it('reports contacts between touching items', () => {
    const touching = { ...other, x: 2.1, y: 3, heading: 0 };
    const p = buildPayload({
      diagram: diagramWith([own, touching]),
      location,
      occurredAt: '',
      clientSubmissionId: 'x',
      mapLayer: esriStreetsLayer(),
      snapshotSvg: null,
    });
    expect(p.diagram.contacts).toEqual([{ itemIds: ['A', 'B'], gapM: 0.15 }]);
  });
});

describe('validate', () => {
  it('requires your vehicle and something you hit', () => {
    const errors = validate(diagramWith([]), location, '').filter((i) => i.level === 'error');
    expect(errors).toHaveLength(2);
  });

  it('passes with only warnings once the essentials are there', () => {
    const own = createVehicle([], 'POLICYHOLDER', 'CAR', { x: 0, y: 0 });
    const wall = createObject('WALL', { x: 0, y: -4 });
    const issues = validate(diagramWith([own, wall]), location, '2026-09-25T10:00');
    expect(issues.every((i) => i.level === 'warning')).toBe(true);
  });
});

describe('history', () => {
  it('treats a whole drag as one undo step', () => {
    const car = createVehicle([], 'POLICYHOLDER', 'CAR', { x: 0, y: 0 });
    let h = historyReducer(initHistory('MAP'), { type: 'add', item: car });
    h = historyReducer(h, { type: 'gestureStart' });
    for (let i = 1; i <= 5; i++) {
      h = historyReducer(h, { type: 'update', id: car.id, update: (it) => ({ ...it, x: i }) as DiagramItem });
    }
    h = historyReducer(h, { type: 'gestureEnd' });
    expect(h.past).toHaveLength(2);
    h = historyReducer(h, { type: 'undo' });
    expect((h.present.items[0] as typeof car).x).toBe(0);
  });

  it('removes a vehicle together with its arrows', () => {
    const car = createVehicle([], 'POLICYHOLDER', 'CAR', { x: 0, y: 0 });
    const arrow = createArrow({ x: 0, y: 0 }, { x: 0, y: -10 }, car.id);
    let h = historyReducer(initHistory('MAP'), { type: 'add', item: car });
    h = historyReducer(h, { type: 'add', item: arrow });
    h = historyReducer(h, { type: 'remove', id: car.id });
    expect(h.present.items).toHaveLength(0);
  });
});

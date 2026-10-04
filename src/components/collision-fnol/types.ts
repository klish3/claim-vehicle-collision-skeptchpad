/**
 * Public contract for the CollisionFnol component.
 *
 * Everything the back end receives is described by `CollisionFnolPayload`.
 * Coordinates in the payload are metres from the diagram origin with
 * x = east (right) and y = north (up). Headings are degrees clockwise from
 * north (map backdrop) or from the top of the sketch (schematic backdrop).
 */

export type VehicleKind = 'CAR' | 'VAN' | 'MOTORCYCLE' | 'BICYCLE' | 'LORRY' | 'BUS';

export type ObjectKind = 'WALL' | 'FENCE' | 'BARRIER' | 'LAMP_POST' | 'BOLLARD' | 'SIGN' | 'TREE' | 'ANIMAL' | 'OTHER';

export type PartyRole = 'POLICYHOLDER' | 'THIRD_PARTY';

export type VehicleMotion = 'MOVING' | 'STOPPED' | 'PARKED';

export type SchematicLayout =
  'CROSSROADS' | 'T_JUNCTION' | 'ROUNDABOUT' | 'STRAIGHT_ROAD' | 'DUAL_CARRIAGEWAY' | 'CAR_PARK' | 'BLANK';

export type BackdropMode = 'MAP' | 'SCHEMATIC';

export type Manoeuvre = 'STRAIGHT' | 'BEAR_LEFT' | 'BEAR_RIGHT' | 'LEFT_TURN' | 'RIGHT_TURN' | 'U_TURN' | 'REVERSING';

export type CollisionWith = 'VEHICLE' | 'OBJECT' | 'VEHICLE_AND_OBJECT' | 'UNKNOWN';

export interface LatLng {
  lat: number;
  lng: number;
}

/** A point in the public payload: metres from origin, x = east, y = north. */
export interface Point {
  x: number;
  y: number;
}

export interface IncidentLocation {
  /** How the location was captured. */
  source: 'SEARCH' | 'DEVICE_GPS' | 'MANUAL';
  /** What the customer typed (empty for GPS). */
  query: string;
  /** Human-readable address shown to the customer. */
  label: string;
  coordinates: LatLng | null;
  road?: string;
  postcode?: string;
  town?: string;
  /** Geocoder that resolved the address, e.g. "nominatim". */
  provider?: string;
  /** Provider's own id for the place, for audit / re-lookup. */
  providerRef?: string;
  /** GPS accuracy radius in metres, when source is DEVICE_GPS. */
  accuracyM?: number;
}

export interface PayloadVehicle {
  /** Letter shown on the sketch. "A" is always the policyholder's vehicle. */
  id: string;
  role: PartyRole;
  kind: VehicleKind;
  motion: VehicleMotion;
  position: Point;
  latLng: LatLng | null;
  headingDeg: number;
  headingCompass: string;
  /** False when the heading was inferred from the vehicle's first arrow (or left at default). */
  headingSetByUser: boolean;
  lengthM: number;
  widthM: number;
  movementIds: string[];
}

export interface PayloadObject {
  id: string;
  kind: ObjectKind;
  position: Point;
  latLng: LatLng | null;
  headingDeg: number;
  lengthM: number;
  widthM: number;
}

export interface PayloadMovement {
  id: string;
  /** Order in which the customer drew the arrows (1-based). */
  sequence: number;
  vehicleId: string | null;
  /** Quadratic Bézier: from → control → to. */
  path: { from: Point; control: Point; to: Point };
  fromLatLng: LatLng | null;
  toLatLng: LatLng | null;
  lengthM: number;
  startBearingDeg: number;
  endBearingDeg: number;
  /** Signed change in direction; positive = clockwise (turning right). */
  turnDeg: number;
  manoeuvre: Manoeuvre;
}

export interface PayloadImpact {
  id: string;
  position: Point;
  latLng: LatLng | null;
  /** Vehicles / objects whose footprint is within 2 m of the impact marker. */
  nearItemIds: string[];
}

export interface PayloadContact {
  /** Two vehicles / objects drawn touching or overlapping (gap ≤ 0.5 m). */
  itemIds: [string, string];
  gapM: number;
}

export interface CollisionFnolPayload {
  schemaVersion: '1.0';
  kind: 'MOTOR_COLLISION_FNOL';
  /** Stable per form session. Also sent as the Idempotency-Key header when `endpoint` is used. */
  clientSubmissionId: string;
  createdAt: string;
  incident: {
    /** Local date-time as entered (YYYY-MM-DDTHH:mm), or null if not given. */
    occurredAt: string | null;
    timezone: string;
    collisionWith: CollisionWith;
    location: IncidentLocation;
    /** Plain-English description generated from the sketch, for handlers and triage. */
    summary: string[];
  };
  diagram: {
    backdrop: {
      mode: BackdropMode;
      layout: SchematicLayout | null;
      layoutRotationDeg: number;
      /** Id of the tile layer drawn on, e.g. "os-road" or "esri-imagery". */
      mapLayer: string | null;
      /** Tile host only (never the full URL, which may carry an API key). */
      tileSource: string | null;
    };
    frame: {
      /** Real-world anchor for (0,0). Null when the sketch is schematic. */
      origin: LatLng | null;
      units: 'metres';
      axes: 'x=east,y=north';
      headingReference: 'TRUE_NORTH' | 'DIAGRAM_UP';
    };
    vehicles: PayloadVehicle[];
    objects: PayloadObject[];
    movements: PayloadMovement[];
    impactPoints: PayloadImpact[];
    contacts: PayloadContact[];
    /** Serialised SVG of the sketch, for display in claims handling tools. */
    snapshotSvg: string | null;
  };
  /** Non-blocking warnings the customer saw and chose to send anyway. */
  validation: { warnings: string[] };
  client: { component: 'CollisionFnol'; version: string; locale: string };
}

export interface SubmitResult {
  /** Claim or notification reference to show the customer. */
  reference?: string;
}

/** Returns the tile URL for a slippy-map tile. */
export type TileUrlFn = (z: number, x: number, y: number) => string;

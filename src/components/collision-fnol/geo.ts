import type { LatLng, TileUrlFn } from './types';

/* ------------------------------------------------------------------ */
/* Geocoding                                                           */
/* ------------------------------------------------------------------ */

export interface GeoResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
  road?: string;
  postcode?: string;
  town?: string;
  provider: string;
}

/**
 * Swap this out for your own address service (Loqate, Google, an internal
 * gazetteer…). Only `search` is required; `reverse` enables "Use my location".
 */
export interface Geocoder {
  readonly name: string;
  search(query: string, signal?: AbortSignal): Promise<GeoResult[]>;
  reverse?(point: LatLng, signal?: AbortSignal): Promise<GeoResult | null>;
}

interface NominatimPlace {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string | undefined>;
}

export interface NominatimOptions {
  baseUrl?: string;
  /** ISO 3166-1 alpha-2 codes, comma separated. Defaults to "gb". */
  countryCodes?: string;
  /** Contact email, recommended by the Nominatim usage policy. */
  email?: string;
  limit?: number;
  language?: string;
}

/**
 * OpenStreetMap Nominatim. Fine for prototypes; the public instance allows
 * ~1 request/second and forbids heavy use, so point `baseUrl` at a hosted or
 * self-hosted instance (or use a different Geocoder) in production.
 */
export function createNominatimGeocoder(options: NominatimOptions = {}): Geocoder {
  const base = (options.baseUrl ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, '');

  const toResult = (p: NominatimPlace): GeoResult => {
    const a = p.address ?? {};
    const road = a.road ?? a.pedestrian ?? a.footway ?? a.highway;
    const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb;
    const first = [a.house_number, road].filter(Boolean).join(' ');
    const label = [first, a.suburb !== town ? a.suburb : undefined, town, a.postcode]
      .filter((s): s is string => Boolean(s && s.trim()))
      .join(', ');
    return {
      id: String(p.place_id),
      label: label || p.display_name,
      lat: Number(p.lat),
      lng: Number(p.lon),
      road,
      postcode: a.postcode,
      town,
      provider: 'nominatim',
    };
  };

  const common = (): URLSearchParams => {
    const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1' });
    if (options.email) params.set('email', options.email);
    params.set('accept-language', options.language ?? 'en-GB');
    return params;
  };

  return {
    name: 'nominatim',
    async search(query, signal) {
      const params = common();
      params.set('q', query);
      params.set('limit', String(options.limit ?? 5));
      params.set('countrycodes', options.countryCodes ?? 'gb');
      const res = await fetch(`${base}/search?${params}`, { signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
      const data = (await res.json()) as NominatimPlace[];
      return data.map(toResult);
    },
    async reverse(point, signal) {
      const params = common();
      params.set('lat', String(point.lat));
      params.set('lon', String(point.lng));
      params.set('zoom', '18');
      const res = await fetch(`${base}/reverse?${params}`, { signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
      const data = (await res.json()) as NominatimPlace | { error: string };
      return 'error' in data ? null : toResult(data);
    },
  };
}

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const GB_BBOX = '-8.7,49.8,1.8,60.9';

/** UK postcodes via postcodes.io (open data, no key). Only answers postcode-shaped queries. */
export function createPostcodesIoGeocoder(options: { baseUrl?: string } = {}): Geocoder {
  const base = (options.baseUrl ?? 'https://api.postcodes.io').replace(/\/$/, '');
  return {
    name: 'postcodes.io',
    async search(query, signal) {
      const q = query.trim();
      if (!UK_POSTCODE.test(q)) return [];
      const res = await fetch(`${base}/postcodes/${encodeURIComponent(q)}`, { signal });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`Postcode lookup failed (${res.status})`);
      const { result } = (await res.json()) as {
        result: { postcode: string; latitude: number; longitude: number; admin_district?: string; parish?: string };
      };
      return [
        {
          id: result.postcode,
          label: [result.postcode, result.admin_district].filter(Boolean).join(', '),
          lat: result.latitude,
          lng: result.longitude,
          postcode: result.postcode,
          town: result.admin_district,
          provider: 'postcodes.io',
        },
      ];
    },
  };
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined> & { osm_id?: number | string; osm_type?: string };
}

/**
 * Photon (komoot) search over OpenStreetMap data: good at road names and
 * junction-level places. Public instance is fair-use; self-host for production.
 */
export function createPhotonGeocoder(
  options: { baseUrl?: string; bbox?: string; countryCode?: string; limit?: number } = {},
): Geocoder {
  const base = (options.baseUrl ?? 'https://photon.komoot.io').replace(/\/$/, '');
  const country = (options.countryCode ?? 'gb').toUpperCase();

  const toResult = (f: PhotonFeature): GeoResult => {
    const p = f.properties;
    const town = p.city ?? p.town ?? p.village ?? p.locality;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const road = p.type === 'street' ? p.name : p.street;
    const label = [
      p.name,
      street && street !== p.name ? street : undefined,
      p.district !== town ? p.district : undefined,
      town,
      p.postcode,
    ]
      .filter((v): v is string => Boolean(v && v.trim()))
      .join(', ');
    return {
      id: `${p.osm_type ?? ''}${p.osm_id ?? label}`,
      label,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      road,
      postcode: p.postcode,
      town,
      provider: 'photon',
    };
  };

  return {
    name: 'photon',
    async search(query, signal) {
      const params = new URLSearchParams({ q: query, limit: String((options.limit ?? 5) * 2), lang: 'en' });
      params.set('bbox', options.bbox ?? GB_BBOX);
      const res = await fetch(`${base}/api/?${params}`, { signal });
      if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
      const data = (await res.json()) as { features: PhotonFeature[] };
      const seen = new Set<string>();
      return data.features
        .filter((f) => !f.properties.countrycode || f.properties.countrycode.toUpperCase() === country)
        .map(toResult)
        .filter((r) => r.label && !seen.has(r.label) && seen.add(r.label))
        .slice(0, options.limit ?? 5);
    },
    async reverse(point, signal) {
      const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lng), limit: '1', lang: 'en' });
      const res = await fetch(`${base}/reverse?${params}`, { signal });
      if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
      const data = (await res.json()) as { features: PhotonFeature[] };
      return data.features[0] ? toResult(data.features[0]) : null;
    },
  };
}

/**
 * Tries each geocoder in turn and returns the first non-empty answer, so a
 * rate-limited or blocked provider (e.g. Nominatim's 429) doesn't stop the claim.
 */
export function createFallbackGeocoder(geocoders: Geocoder[]): Geocoder {
  return {
    name: geocoders.map((g) => g.name).join('>'),
    async search(query, signal) {
      let lastError: unknown = null;
      for (const g of geocoders) {
        try {
          const results = await g.search(query, signal);
          if (results.length) return results;
        } catch (err) {
          if (signal?.aborted) throw err;
          lastError = err;
        }
      }
      if (lastError) throw new Error('Address search isn’t available right now.');
      return [];
    },
    async reverse(point, signal) {
      for (const g of geocoders) {
        if (!g.reverse) continue;
        try {
          const r = await g.reverse(point, signal);
          if (r) return r;
        } catch (err) {
          if (signal?.aborted) throw err;
        }
      }
      return null;
    },
  };
}

/**
 * Keyless address search for prototypes: postcodes.io for postcodes, then
 * Photon, then Nominatim. For production use a licensed service such as
 * OS Places / OS Names or Loqate behind your own API.
 */
export function developmentGeocoder(countryCodes = 'gb'): Geocoder {
  return createFallbackGeocoder([
    ...(countryCodes.toLowerCase().split(',').includes('gb') ? [createPostcodesIoGeocoder()] : []),
    createPhotonGeocoder({ countryCode: countryCodes.split(',')[0] }),
    createNominatimGeocoder({ countryCodes }),
  ]);
}

/* ------------------------------------------------------------------ */
/* Map tiles                                                           */
/* ------------------------------------------------------------------ */

/**
 * A slippy-map tile layer. Attribution lines are separated by " | " and
 * drawn bottom-right on the sketch.
 */
export interface MapLayer {
  id: string;
  /** Shown on the background switcher, e.g. "Street map" or "Satellite". */
  label: string;
  kind: 'street' | 'satellite';
  url: TileUrlFn;
  attribution: string;
  /** Highest zoom the provider serves; the sketch over-zooms beyond it. */
  maxZoom: number;
}

const retina = () => (typeof window !== 'undefined' && window.devicePixelRatio > 1 ? '@2x' : '');
const keyParam = (name: string, key?: string) => (key ? `?${name}=${encodeURIComponent(key)}` : '');

/**
 * Ordnance Survey Maps API (OS Data Hub). The best fit for UK claims:
 * zoom 17–20 use OS MasterMap, so lanes and kerb lines are accurate.
 * Zooms 17+ are premium data and need an eligible Data Hub plan.
 */
export function osMapsLayer(options: { apiKey: string; style?: 'Road' | 'Light' | 'Outdoor' }): MapLayer {
  const style = options.style ?? 'Road';
  return {
    id: `os-${style.toLowerCase()}`,
    label: 'Street map',
    kind: 'street',
    url: (z, x, y) =>
      `https://api.os.uk/maps/raster/v1/zxy/${style}_3857/${z}/${x}/${y}.png${keyParam('key', options.apiKey)}`,
    attribution: `Contains OS data © Crown copyright and database rights ${new Date().getFullYear()}`,
    maxZoom: 20,
  };
}

const ESRI_LEGACY = 'https://server.arcgisonline.com/ArcGIS/rest/services';

/**
 * Esri street map. With an ArcGIS Location Platform key this uses the Static
 * Basemap Tiles service (metered, 2M free tiles/month at the time of writing).
 * Without a key it uses Esri's legacy public endpoint: development only.
 */
export function esriStreetsLayer(options: { apiKey?: string } = {}): MapLayer {
  const base = 'https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1';
  return {
    id: 'esri-streets',
    label: 'Street map',
    kind: 'street',
    url: options.apiKey
      ? (z, x, y) => `${base}/arcgis/streets/static/tile/${z}/${y}/${x}${keyParam('token', options.apiKey)}`
      : (z, x, y) => `${ESRI_LEGACY}/World_Street_Map/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Powered by Esri | Esri, HERE, Garmin, © OpenStreetMap contributors',
    maxZoom: options.apiKey ? 20 : 19,
  };
}

/**
 * Esri World Imagery (satellite): shows real lane markings, which helps
 * customers place vehicles. Keyed requests go through Esri's basemap API;
 * keyless ones use the legacy public endpoint (development only).
 */
export function esriImageryLayer(options: { apiKey?: string } = {}): MapLayer {
  return {
    id: 'esri-imagery',
    label: 'Satellite',
    kind: 'satellite',
    url: options.apiKey
      ? (z, x, y) =>
          `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}${keyParam('token', options.apiKey)}`
      : (z, x, y) => `${ESRI_LEGACY}/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Powered by Esri | Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  };
}

/**
 * CARTO raster basemaps (OpenStreetMap data). Since September 2026 CARTO
 * needs a key: keyless requests return "API KEY REQUIRED" images with a 200
 * status, which no health check can tell apart from a real tile.
 */
export function cartoLayer(options: { apiKey: string; style?: 'voyager' | 'positron' }): MapLayer {
  const path = options.style === 'positron' ? 'light_all' : 'rastertiles/voyager';
  return {
    id: `carto-${options.style ?? 'voyager'}`,
    label: 'Street map',
    kind: 'street',
    url: (z, x, y) =>
      `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/${path}/${z}/${x}/${y}${retina()}.png${keyParam('key', options.apiKey)}`,
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 20,
  };
}

/**
 * OpenStreetMap's own tile servers. Volunteer-run: they block apps that
 * don't send a Referer (file://, sandboxed iframes, `Referrer-Policy: no-referrer`)
 * and anything resembling commercial or heavy use. Local development only.
 */
export function osmLayer(): MapLayer {
  return {
    id: 'osm',
    label: 'Street map',
    kind: 'street',
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  };
}

/**
 * Keyless layers so the component works out of the box in a prototype
 * (Esri's legacy public endpoints, which don't need a Referer or key).
 * For production pass licensed layers, e.g.
 * `[osMapsLayer({ apiKey: OS_KEY }), esriImageryLayer({ apiKey: ARCGIS_KEY })]`.
 */
export function developmentMapLayers(): MapLayer[] {
  return [esriStreetsLayer(), esriImageryLayer()];
}

/**
 * Checks that a layer actually serves tiles here before we show it. Catches
 * blocked (403), unauthorised (401/498), rate-limited (429) and offline
 * providers, so the customer never sees a wall of error tiles.
 */
export async function probeLayer(layer: MapLayer, at: LatLng, signal?: AbortSignal): Promise<boolean> {
  const z = Math.min(layer.maxZoom, 17);
  const p = worldPixel(at, z);
  const url = layer.url(z, Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE));
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 8000);
  const abort = () => timeout.abort();
  signal?.addEventListener('abort', abort);
  try {
    const res = await fetch(url, {
      mode: 'cors',
      cache: 'force-cache',
      referrerPolicy: 'strict-origin-when-cross-origin',
      signal: timeout.signal,
    });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

const EARTH_RADIUS = 6378137;
const TILE_SIZE = 256;
const DEG = Math.PI / 180;

/** Web-Mercator world pixel coordinates at zoom z. */
export function worldPixel(p: LatLng, z: number): { x: number; y: number } {
  const size = TILE_SIZE * 2 ** z;
  const sin = Math.min(Math.max(Math.sin(p.lat * DEG), -0.9999), 0.9999);
  return {
    x: ((p.lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** Ground metres covered by one tile pixel at the given latitude and zoom. */
export function metresPerPixel(lat: number, z: number): number {
  return (2 * Math.PI * EARTH_RADIUS * Math.cos(lat * DEG)) / (TILE_SIZE * 2 ** z);
}

/** Continuous zoom level at which one metre is `pxPerMetre` screen pixels. */
export function zoomForScale(lat: number, pxPerMetre: number): number {
  return Math.log2((2 * Math.PI * EARTH_RADIUS * Math.cos(lat * DEG) * pxPerMetre) / TILE_SIZE);
}

/**
 * Converts a local offset (metres; x = east, y = SOUTH, i.e. SVG space)
 * to latitude/longitude. Accurate to centimetres over the few hundred
 * metres a collision sketch covers.
 */
export function offsetToLatLng(origin: LatLng, x: number, y: number): LatLng {
  return {
    lat: origin.lat - y / EARTH_RADIUS / DEG,
    lng: origin.lng + x / (EARTH_RADIUS * Math.cos(origin.lat * DEG)) / DEG,
  };
}

export interface TilePlacement {
  key: string;
  url: string;
  /** Top-left corner and size in local metres (SVG space). */
  x: number;
  y: number;
  size: number;
}

/**
 * Tiles needed to cover the viewport. Tiles are fetched at the next zoom
 * up from the display scale (capped at maxZoom and over-zoomed beyond it).
 */
export function visibleTiles(args: {
  origin: LatLng;
  center: { x: number; y: number };
  scale: number;
  width: number;
  height: number;
  tileUrl: TileUrlFn;
  maxZoom?: number;
}): TilePlacement[] {
  const { origin, center, scale, width, height, tileUrl } = args;
  const maxZoom = args.maxZoom ?? 19;
  const z = Math.max(0, Math.min(maxZoom, Math.ceil(zoomForScale(origin.lat, scale) - 0.25)));
  const mpp = metresPerPixel(origin.lat, z);
  const o = worldPixel(origin, z);
  const halfW = width / 2 / scale + 5;
  const halfH = height / 2 / scale + 5;
  const n = 2 ** z;

  const x0 = Math.floor((o.x + (center.x - halfW) / mpp) / TILE_SIZE);
  const x1 = Math.floor((o.x + (center.x + halfW) / mpp) / TILE_SIZE);
  const y0 = Math.max(0, Math.floor((o.y + (center.y - halfH) / mpp) / TILE_SIZE));
  const y1 = Math.min(n - 1, Math.floor((o.y + (center.y + halfH) / mpp) / TILE_SIZE));

  const tiles: TilePlacement[] = [];
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) return tiles; // safety valve
  const size = TILE_SIZE * mpp;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wrapped = ((tx % n) + n) % n;
      tiles.push({
        key: `${z}/${tx}/${ty}`,
        url: tileUrl(z, wrapped, ty),
        x: (tx * TILE_SIZE - o.x) * mpp,
        y: (ty * TILE_SIZE - o.y) * mpp,
        size,
      });
    }
  }
  return tiles;
}

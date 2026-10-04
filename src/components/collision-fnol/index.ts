/**
 * CollisionFnol — motor first notification of loss, sketch-first.
 *
 *   import { CollisionFnol } from './collision-fnol';
 *
 *   <CollisionFnol
 *     onSubmit={async (payload) => {
 *       const res = await api.post('/claims/motor/fnol', payload);
 *       return { reference: res.data.reference };
 *     }}
 *   />
 *
 * Or let the component POST for you: <CollisionFnol endpoint="/api/fnol" headers={{ Authorization }} />
 *
 * Map backgrounds: the defaults are keyless development layers. In production pass licensed ones:
 *   <CollisionFnol mapLayers={[osMapsLayer({ apiKey: OS_KEY }), esriImageryLayer({ apiKey: ARCGIS_KEY })]} … />
 * The back-end contract is `CollisionFnolPayload` in ./types.
 */
export { CollisionFnol, type CollisionFnolProps } from './CollisionFnol';
export {
  createNominatimGeocoder,
  createPhotonGeocoder,
  createPostcodesIoGeocoder,
  createFallbackGeocoder,
  developmentGeocoder,
  osMapsLayer,
  esriStreetsLayer,
  esriImageryLayer,
  cartoLayer,
  osmLayer,
  developmentMapLayers,
  probeLayer,
  type Geocoder,
  type GeoResult,
  type MapLayer,
} from './geo';
export { buildPayload, validate, COMPONENT_VERSION } from './payload';
export type * from './types';

import { describe, expect, it, vi } from 'vitest';
import {
  createFallbackGeocoder,
  createPostcodesIoGeocoder,
  probeLayer,
  type GeoResult,
  type Geocoder,
  type MapLayer,
} from './geo';

const hit: GeoResult = { id: '1', label: 'Bridge Street, Guildford', lat: 51.2, lng: -0.57, provider: 'b' };
const failing: Geocoder = { name: 'a', search: () => Promise.reject(new Error('429')) };
const empty: Geocoder = { name: 'e', search: () => Promise.resolve([]) };
const working: Geocoder = { name: 'b', search: () => Promise.resolve([hit]) };

describe('createFallbackGeocoder', () => {
  it('skips providers that fail or find nothing', async () => {
    await expect(createFallbackGeocoder([failing, empty, working]).search('x')).resolves.toEqual([hit]);
  });
  it('gives a friendly error when every provider fails', async () => {
    await expect(createFallbackGeocoder([failing, failing]).search('x')).rejects.toThrow('isn’t available');
  });
  it('only reports "no matches" when every provider answered', async () => {
    await expect(createFallbackGeocoder([empty, failing, empty]).search('x')).rejects.toThrow();
    await expect(createFallbackGeocoder([empty]).search('x')).resolves.toEqual([]);
  });
});

describe('createPostcodesIoGeocoder', () => {
  it('ignores queries that are not postcodes without calling the network', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(createPostcodesIoGeocoder().search('Bridge Street')).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('probeLayer', () => {
  const layer: MapLayer = {
    id: 't',
    label: 'T',
    kind: 'street',
    url: () => 'https://tiles.test/1/2/3.png',
    attribution: '',
    maxZoom: 19,
  };
  const respond = (status: number, type: string) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x', { status, headers: { 'content-type': type } }));

  it('accepts a real tile', async () => {
    const spy = respond(200, 'image/png');
    await expect(probeLayer(layer, { lat: 51, lng: 0 })).resolves.toBe(true);
    spy.mockRestore();
  });
  it('rejects a blocked provider (403 with an image body, like OSM)', async () => {
    const spy = respond(403, 'image/png');
    await expect(probeLayer(layer, { lat: 51, lng: 0 })).resolves.toBe(false);
    spy.mockRestore();
  });
  it('rejects a provider answering with an error document', async () => {
    const spy = respond(200, 'application/json');
    await expect(probeLayer(layer, { lat: 51, lng: 0 })).resolves.toBe(false);
    spy.mockRestore();
  });
  it('rejects when the network fails', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(probeLayer(layer, { lat: 51, lng: 0 })).resolves.toBe(false);
    spy.mockRestore();
  });
});

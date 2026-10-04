# Vehicle collision FNOL

A React + TypeScript single-page app (Vite) hosting the `CollisionFnol` component: a sketch-first
motor first notification of loss. The customer finds where the accident happened, draws the
vehicles, objects, movements and impact points on a map or road sketch, then reviews and sends.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script              | What it does                         |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the Vite dev server            |
| `npm run build`     | Type-check and build to `dist/`      |
| `npm run preview`   | Serve the production build           |
| `npm test`          | Run the component's unit tests       |
| `npm run typecheck` | Type-check only                      |
| `npm run lint`      | Lint with oxlint                     |

## Submitting

By default the app captures submissions locally: after **Send** it shows the generated reference,
a rendering of the sketch snapshot and the full JSON payload (downloadable).

To POST to a real back end instead, set `VITE_FNOL_ENDPOINT` (e.g. in `.env.local`):

```bash
VITE_FNOL_ENDPOINT=https://api.example.com/claims/motor/fnol
```

The component sends the payload as JSON with an `Idempotency-Key` header and reads an optional
`{ "reference": "..." }` from the response. The contract is `CollisionFnolPayload` in
[`src/components/collision-fnol/types.ts`](src/components/collision-fnol/types.ts); see
[`example-payload.json`](src/components/collision-fnol/example-payload.json) for a sample.

## Maps and address lookup

The defaults are keyless **development** services (postcodes.io / Photon / Nominatim for search,
Esri tiles for the map). Each map layer is health-checked at the incident location; if none work
the customer draws on a road sketch instead, and if search fails they can continue with a sketch.
For production pass licensed providers via the `geocoder` and `mapLayers` props — see
[`src/components/collision-fnol/index.ts`](src/components/collision-fnol/index.ts).

## Layout

```
src/
  App.tsx                    demo host page
  components/collision-fnol/ the component (self-contained; styles in CollisionFnol.module.css)
```

# Truck Route Planner: Frontend

React, TypeScript, Vite, Tailwind CSS v4 and MapLibre GL.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173 (start the backend first)
npm run build      # type-check and production build
```

## Configuration

Set these in `.env.local` (see [`.env.example`](.env.example)):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_DATA_SOURCE` | `api` | `api` calls the Django backend, `mock` uses simulated sample data |
| `VITE_API_BASE_URL` | *(empty)* | Backend URL for production builds. Empty uses the dev proxy |
| `API_PROXY_TARGET` | `http://127.0.0.1:8000` | Where the dev server forwards `/api` requests |
| `VITE_MAP_STYLE_URL` | CARTO Voyager | Any MapLibre style URL |

In mock mode the header shows a "Sample data" badge, since the routes and weather are made up.

## API

- `POST /api/routes/analyze`: request and response types are in [`src/types/routing.ts`](src/types/routing.ts).
- `GET /api/locations/search?q=`: place suggestions for the origin and destination fields.

Risk levels and the recommendation come from the backend; the frontend only displays them.
[`src/data/mock/`](src/data/mock/) returns the same response shape with fake data, which was used to build the
UI before the backend existed.

## Structure

```
src/
  components/
    layout/       AppHeader, DashboardLayout, InfoDialog (About / Help)
    trip/         TripForm, LocationInput, CheckpointInterval
    map/          RouteMap, MapLayerControls, ForecastSlider, MapLegend,
                  mapLayers.ts, mapData.ts, weatherLayers.ts
    routes/       RouteComparison, RouteCard, RiskBadge
    checkpoints/  CheckpointTable, CheckpointDetails
    common/       Button, Input, LoadingState, ErrorState
  services/       routingApi.ts, apiError.ts
  hooks/          useRouteAnalysis.ts
  lib/            formatting, geometry and weather text helpers
  data/mock/      sample data
  styles/         globals.css (Tailwind theme), tokens.ts (map colors)
  types/          routing.ts
```

## Map notes

- The map is created once. New results replace the GeoJSON source data, and selecting a route only changes
  layer filters, so the map doesn't jump around.
- Routes and checkpoints are WebGL layers rather than DOM markers. Hover and selection use `feature-state`.
- All 49 hours of the weather grid are stored as feature properties (`p0` to `p48` for rain, `w` wind, `s` snow,
  `k` clouds, `x` combined). Moving the slider only changes the `circle-color` expression, at most once per frame.
- Weather cells are drawn as blurred circles instead of a heatmap layer. A heatmap adds up neighbouring points,
  which made a single cell of moderate weather look much weaker than it was.
- Weather colours use the risk levels: light blue for light weather, then yellow, orange and red at the
  Moderate, High and Severe thresholds. Pointing at the map shows the weather at that spot in words.

## Notes on the rules

- The forecast slider only changes the map. Checkpoint risk always uses the forecast at that checkpoint's ETA.
- A value exactly on a boundary goes to the higher band (rain 0.25 in/hr is High), except the No Travel limits
  for rain and snow, which are strictly greater than 1.00 and 3.0.
- Each checkpoint covers the road halfway to the next one. Risk miles are added up from those stretches.
- Average risk is weighted by distance, from 0 (Low) to 4 (No Travel).
- Routes with any No Travel miles are never recommended. If all routes have some, the page says
  "No safe route available".

# Truck Route Planner — Frontend

React + TypeScript + Vite + Tailwind CSS v4 + MapLibre GL client for the Weather-Aware Truck Routing assessment.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173 (start the backend first)
npm run build      # type-check + production build
```

## Configuration

Set these in `.env.local` (see [`.env.example`](.env.example)):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_DATA_SOURCE` | `api` | `api` calls the Django backend; `mock` serves simulated sample data |
| `VITE_API_BASE_URL` | *(empty)* | Backend origin for production builds. Empty uses the dev proxy |
| `API_PROXY_TARGET` | `http://127.0.0.1:8000` | Where the dev server forwards `/api` requests |
| `VITE_MAP_STYLE_URL` | CARTO Voyager | Any MapLibre style URL |

Sample mode is clearly labelled in the UI. Its routes and weather are **simulated**, not forecasts.

## API contract

`POST /api/routes/analyze` — request and response types live in [`src/types/routing.ts`](src/types/routing.ts).
`GET /api/locations/search?q=` — returns `LocationSuggestion[]` for the origin/destination autocomplete.

The backend is authoritative for risk classification and ranking; the client only renders results.
[`src/data/mock/`](src/data/mock/) is a stand-in that produces the same response shape (corridors, a moving
storm-cell field, the risk rules, and ranking) so the UI can be developed without the backend.

## Structure

```
src/
  components/
    layout/   AppHeader, DashboardLayout, InfoDialog (About / Help)
    trip/     TripForm, LocationInput (combobox), CheckpointInterval (segmented radio)
    map/      RouteMap, MapLayerControls, ForecastSlider (+ ForecastBadge), MapLegend,
              mapLayers.ts (sources/layers), mapData.ts (API → GeoJSON), weatherLayers.ts
    routes/   RouteComparison, RouteCard, RiskBadge
    checkpoints/ CheckpointTable, CheckpointDetails
    common/   Button, Input, LoadingState, ErrorState
  services/   routingApi.ts (mock/live switch), apiError.ts
  hooks/      useRouteAnalysis.ts
  data/mock/  simulated backend (sample mode only)
  styles/     globals.css (@theme design tokens), tokens.ts (colors MapLibre needs as literals)
  types/      routing.ts (API contract)
```

## Map performance notes

- The map is created once; results update GeoJSON sources with `setData`, and route selection only swaps layer filters, so the camera never resets.
- Routes and checkpoints are WebGL layers (no per-checkpoint DOM markers). Hover and selection use `feature-state`. The selected route's checkpoint dots are colored by risk level.
- The heatmap source holds all 49 hourly frames as feature properties (`p0…p48` rain, `w…` wind, `s…` snow, `k…` clouds, `x…` combined). Moving the slider swaps only the `heatmap-weight` expression, coalesced to one update per animation frame.
- "Weather Heatmap" (combined) shows the strongest of rain, wind, and snow at each point, each normalized on its own risk thresholds.
- Heatmap radius tracks the grid spacing at every zoom, and intensity normalizes the kernel sum so color reflects the actual value. Each layer's color steps sit on its risk thresholds.

## Interpretation notes

- **Forecast slider vs. route risk:** the slider explores the corridor forecast from the departure hour to +48 h. Checkpoint risk always uses that checkpoint's own ETA.
- **Shared band endpoints** go to the higher band (rain 0.25 in/hr → High). The exceptions are the No Travel edges, which the spec defines as strictly greater (rain > 1.00, snow > 3.0).
- **Segments:** each checkpoint represents the road halfway to its neighbours. Risk miles are summed from those segments.
- **Average risk:** distance-weighted, Low = 0 … No Travel = 4.
- **Eligibility:** routes with any No Travel miles are never recommended; if every route has them, the UI shows "No safe route available".

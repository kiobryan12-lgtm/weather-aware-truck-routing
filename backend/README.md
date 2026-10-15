# Truck Route Planner — Backend

Django API that finds three routes, samples the weather forecast at each checkpoint's estimated arrival time,
classifies risk with the assessment rules, and recommends the safest route.

## Run

```bash
python -m venv .venv
source .venv/Scripts/activate   # Git Bash. PowerShell: .venv\Scripts\Activate.ps1  macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver      # http://127.0.0.1:8000
python manage.py test
```

No database or API keys are needed.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/routes/analyze` | Routes, checkpoints, risk, recommendation and the 48-hour heatmap grid |
| `GET` | `/api/locations/search?q=` | US place suggestions for the trip form |
| `GET` | `/api/health` | Health check |

Request body for `/api/routes/analyze`:

```json
{
  "origin": "Denver, CO",
  "destination": "Kansas City, MO",
  "departure_time": "2026-10-16T14:00:00Z",
  "load_weight_lb": 35000,
  "checkpoint_interval_miles": 25
}
```

The response shape is defined in [`frontend/src/types/routing.ts`](../frontend/src/types/routing.ts).
Errors return `{"detail": "..."}` with status 400 (invalid input or unknown place), 422 (no drivable route),
502 (a data provider failed) or 500.

## How it works

1. **Geocoding** — Open-Meteo geocoding, limited to US places.
2. **Routing** — OSRM. When it returns fewer than three alternatives, more are found by routing through points
   shifted to either side of the trip; near-duplicates and detours over 1.6× the fastest distance are dropped.
3. **Truck travel time** — OSRM car times with every road segment capped at 65 mph (`TRUCK_MAX_SPEED_MPH`).
4. **Checkpoints** — every 10, 25 or 50 miles plus the destination. Each ETA is the departure time plus the
   truck travel time to that point.
5. **Weather** — Open-Meteo hourly forecast. Checkpoints are snapped to a 0.25° (~15 mi) forecast cell, close
   to the forecast model's resolution, so nearby checkpoints share one forecast. Wind is interpolated to the
   exact ETA; rain and snow use the hour containing the ETA. The heatmap uses a 1° grid within 75 miles of the
   routes.
6. **Risk** — each condition is classified, the worst one wins, then load rules may raise wind risk.
7. **Ranking** — routes with any No Travel miles are excluded; the rest are ranked by fewest Severe miles,
   fewest High miles, lowest average risk, then shortest travel time.

## Interpretation notes

- A value on a shared band boundary belongs to the higher band (rain 0.25 in/hr is High). The No Travel edges
  for rain and snow are strictly greater (> 1.00 and > 3.0 in/hr), as in the spec.
- Load rules only raise risk: 45–54 mph with more than 30,000 lb is No Travel; 35–44 mph with more than
  40,000 lb is Severe. Wind of 55 mph or more is No Travel for any load.
- Wind uses sustained 10 m wind speed, not gusts.
- Each checkpoint represents the road halfway to its neighbours. Severe and High miles are the sum of those
  stretches; average risk is distance-weighted with Low = 0 … No Travel = 4.
- Forecasts reach about 16 days ahead. Checkpoints beyond that are Unknown, and a route without forecast
  data is not recommended.
- Detour alternatives can use slower two-lane roads near the shifted points, so their travel times are
  conservative.

## API limits

Open-Meteo's free plan allows about 600 forecast locations per minute. A new trip uses roughly 150–280,
depending on length and checkpoint interval. To stay well within the limit:

- every search for the same departure requests the same 48-hour window, so forecasts are cached for
  30 minutes and changing the load or interval costs little or nothing;
- identical searches are served from a 10-minute result cache;
- if the limit is reached anyway, the API returns 503 with a message to wait a minute rather than retrying.

## Configuration

See [`.env.example`](.env.example). Settings are read from environment variables:

| Variable | Default |
|---|---|
| `DJANGO_DEBUG` | `true` |
| `DJANGO_SECRET_KEY` | required when debug is off |
| `DJANGO_ALLOWED_HOSTS` | `127.0.0.1,localhost` |
| `CORS_ALLOWED_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` |
| `TRUCK_MAX_SPEED_MPH` | `65` |
| `WEATHER_GRID_SPACING_DEG` | `1.0` |
| `FORECAST_CELL_DEG` | `0.25` |

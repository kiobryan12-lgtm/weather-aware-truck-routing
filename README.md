# Weather-Aware Truck Routing

A React + Django web app that helps a truck driver choose the safest route by weather, load weight, and travel time.

The driver enters an origin, destination, departure time, and load weight. The app compares three routes, samples the
forecast at checkpoints every 10, 25, or 50 miles using the truck's estimated arrival time at each one, classifies risk
with the assessment's weather and load rules, and recommends the best route. A 0–48 hour heatmap shows the weather
along the trip.

## Repository

| Path | Contents |
|---|---|
| [`backend/`](backend/) | Django API: geocoding, routing, weather, risk rules, ranking |
| [`frontend/`](frontend/) | React, TypeScript, Vite, Tailwind CSS, MapLibre GL |

## Run locally

Backend (no database or API keys needed):

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Git Bash. PowerShell: .venv\Scripts\Activate.ps1  macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver      # http://127.0.0.1:8000
```

Keep the backend running and start the frontend in a second terminal.

Frontend:

```bash
cd frontend
npm install
npm run dev                     # http://127.0.0.1:5173
```

If port 8000 is taken, run the backend on another port (`python manage.py runserver 8001`) and set
`API_PROXY_TARGET=http://127.0.0.1:8001` in `frontend/.env.local`.

## Data sources

| Need | Provider |
|---|---|
| Routing | [OSRM](https://project-osrm.org/) |
| Weather forecast | [Open-Meteo](https://open-meteo.com/) |
| Geocoding | [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) |
| Basemap | [CARTO](https://carto.com/basemaps) |

## Recommendation rules

Routes with any No Travel miles are never recommended. The others are ranked by:

1. Fewest Severe miles
2. Fewest High miles
3. Lowest average risk
4. Shortest travel time

See [`backend/README.md`](backend/README.md) for how risk is calculated and how the spec's ambiguities were
interpreted, and [`frontend/README.md`](frontend/README.md) for UI configuration and map performance notes.

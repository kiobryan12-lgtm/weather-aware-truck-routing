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

## Deploy

Backend on [Render](https://render.com) (free web service), frontend on [Vercel](https://vercel.com).

1. **Render:** New > Blueprint > pick this repository. [`render.yaml`](render.yaml) sets up the service.
   Leave `CORS_ALLOWED_ORIGINS` empty for now and copy the service URL once it's live.
2. **Vercel:** Add New > Project > import this repository, set **Root Directory** to `frontend`, and add the
   environment variable `VITE_API_BASE_URL` = the Render URL. Deploy and copy the site URL.
3. **Render:** set `CORS_ALLOWED_ORIGINS` to the Vercel URL (no trailing slash) and save.

Render's free tier sleeps after 15 minutes without traffic, so the first request after that takes up to a minute.

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

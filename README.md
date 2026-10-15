# Weather-Aware Truck Routing

A React + Django web app that helps a truck driver choose the safest route by weather, load weight, and travel time.

The driver enters an origin, destination, departure time, and load weight. The app compares three routes, samples the
forecast at checkpoints every 10, 25, or 50 miles using the truck's estimated arrival time at each one, classifies risk
with the assessment's weather and load rules, and recommends the best route.

## Repository

| Path | Contents |
|---|---|
| [`frontend/`](frontend/) | React, TypeScript, Vite, Tailwind CSS, MapLibre GL |
| `backend/` | Django API: routing, weather, risk rules, ranking *(in progress)* |

## Run the frontend

```bash
cd frontend
npm install
npm run dev   # http://127.0.0.1:5173
```

Until the backend is connected, the frontend runs on clearly labelled simulated sample data.
See [`frontend/README.md`](frontend/README.md) for configuration, the API contract, and design notes.

## Recommendation rules

Routes with any No Travel miles are never recommended. The others are ranked by:

1. Fewest Severe miles
2. Fewest High miles
3. Lowest average risk
4. Shortest travel time

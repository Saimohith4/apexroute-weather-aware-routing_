# Weather-Aware Truck Routing

A full-stack web application that compares truck routes using weather forecasts and load-aware safety rules to help identify safer travel options.

## Features

- **Route planning:** Enter an origin, destination, departure date/time, and truck load.
- **Alternative routes:** Retrieve available route options from a routing provider.
- **Weather checkpoints:** Sample weather along routes at configurable 10-, 25-, or 50-mile intervals.
- **ETA-aware analysis:** Estimate checkpoint arrival times and evaluate weather conditions.
- **Load-aware risk classification:** Classify wind, rain, and snowfall risk using the assessment thresholds.
- **Route recommendations:** Rank routes by severe-risk miles, high-risk miles, average risk, and travel time, while filtering unsafe or incompletely covered routes.
- **Forecast timeline:** Inspect available hourly forecasts across a 0–48-hour window.
- **Interactive map:** Explore route geometry and checkpoint weather details.

## Technology Stack

### Frontend
- React
- TypeScript
- Vite
- CSS
- Leaflet for interactive maps

### Backend
- Python
- Django
- Django REST Framework
- Requests

### External services
- OpenRouteService for geocoding and route directions
- Open-Meteo for weather forecasts
- OpenStreetMap tiles for map visualization

## Project Structure

```text
weather-aware-routing/
├── backend/
│   ├── config/
│   ├── routing/
│   │   ├── risk_engine.py
│   │   ├── services.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── tests.py
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── RouteMap.tsx
│   │   └── main.tsx
│   └── package.json
├── .gitignore
└── README.md
```

*The structure above describes the main project areas; individual filenames may vary as the project evolves.*

## Local Setup

### Prerequisites

- Python installed
- Node.js and npm installed
- An OpenRouteService API key

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd weather-aware-routing
```

### 2. Configure the backend

Open a terminal in the project root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create `backend/.env` with your local configuration:

```dotenv
DJANGO_SECRET_KEY=your-new-random-secret
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
OPENROUTESERVICE_API_KEY=your-openrouteservice-api-key
```

Replace the example values with your own values. Never commit `.env` files or expose API keys.

Start the backend:

```powershell
python manage.py check
python manage.py migrate
python manage.py runserver
```

The backend runs at `http://127.0.0.1:8000` by default.

### 3. Configure the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

Ensure the frontend's API base URL points to your local Django backend. Configure it using the variable or setting expected by the frontend code.

## Weather Risk Rules

### Wind

| Wind speed | Classification |
|---|---|
| Below 25 mph | Low |
| 25–34 mph | Moderate |
| 35–44 mph | High |
| 45–54 mph | Severe |
| 55 mph or higher | No Travel |

Load-specific rules:
- Wind at 45–54 mph with a load above 30,000 lb results in No Travel.
- Wind at 35–44 mph with a load above 40,000 lb is classified as Severe.

### Rainfall

| Rainfall intensity | Classification |
|---|---|
| Below 0.10 in/hr | Low |
| 0.10–below 0.25 in/hr | Moderate |
| 0.25–below 0.50 in/hr | High |
| 0.50–1.00 in/hr | Severe |
| Above 1.00 in/hr | No Travel |

### Snowfall

| Snowfall intensity | Classification |
|---|---|
| Below 0.50 in/hr | Low |
| 0.50–below 1.00 in/hr | Moderate |
| 1.00–below 2.00 in/hr | High |
| 2.00–3.00 in/hr | Severe |
| Above 3.00 in/hr | No Travel |

The overall checkpoint risk is the highest classification among wind, rainfall, and snowfall.

## Route Recommendation

Routes are evaluated using the following assessment priorities:

1. Fewest Severe-risk miles.
2. Fewest High-risk miles.
3. Lowest average risk score.
4. Shortest travel time.

Safety filtering takes precedence: routes with No Travel conditions or incomplete weather coverage are not eligible for recommendation.

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health/` | Check backend availability |
| POST | `/api/analyze-route/` | Analyze a trip and return route/weather results |

The analysis request includes the origin, destination, timezone-aware departure time, load in pounds, and checkpoint interval.

## Testing

From the backend directory:

```powershell
python manage.py check
python manage.py test routing
```

The backend test suite currently contains 17 tests.

Build the frontend from the frontend directory:

```powershell
npm run build
```

## Limitations

- Weather forecasts are estimates, not guarantees of road safety.
- Checkpoint ETAs are estimated and may not account for live traffic or changing road conditions.
- Forecast availability depends on the weather provider and forecast horizon.
- The number of genuine alternative routes depends on the routing provider and trip distance.
- Weather coverage and checkpoint sampling affect the precision of route-risk estimates.

## Security

- Store API keys and Django secrets in environment variables.
- Never commit `.env`, virtual environments, `node_modules`, or generated build output.
- Set `DJANGO_DEBUG=False` in production.
- Configure `DJANGO_ALLOWED_HOSTS` for the deployed backend.
- Use HTTPS and configure production CORS origins appropriately.

## License

Add the license appropriate for your project before distributing or reusing the code.


## Production deployment (Render + Vercel)

### Render web service

Keep the repository root as the Render Root Directory. Configure:

- **Build Command:** `bash build.sh`
- **Start Command:** `bash start.sh`
- **Environment variables:** `DATABASE_URL` (the Render PostgreSQL internal URL when both services share a region), `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, `DJANGO_ALLOWED_HOSTS` (include the Render service hostname), and `OPENROUTESERVICE_API_KEY`.

The start script runs `python manage.py migrate --noinput` before Gunicorn so a new production database receives Django's built-in tables. This is suitable for the project's current single web instance; for multiple production instances, run migrations once in a platform pre-deploy job instead. Do not set `DATABASE_URL` to a local SQLite path. Production settings fail fast if `DATABASE_URL` is missing, rather than silently falling back to SQLite.

For local development, copy `backend/.env.example` to `backend/.env`, set a new local `DJANGO_SECRET_KEY`, set `DJANGO_DEBUG=True`, and add your own API key. The `.env` file, virtual environments, node_modules, and local database are intentionally not included in this ZIP.

### Vercel frontend

Set the project Root Directory to `frontend`, Build Command to `npm run build`, and Output Directory to `dist`. The frontend uses `http://127.0.0.1:8000/api` during Vite development and same-origin `/api` in production. `frontend/vercel.json` rewrites `/api/*` requests to the Render backend so browser session cookies stay on the Vercel origin. Remove any old `VITE_API_URL` setting that points directly to Render, or set it to `/api`, then redeploy.

### Verify after deployment

1. Open `https://<your-render-service>.onrender.com/api/health/` and confirm a healthy response.
2. In Render logs, verify the service starts without a database configuration error and migrations complete.
3. Register a new account; expect HTTP `201`.
4. Log in; expect HTTP `200`; then request `/api/auth/me/` and expect `200` while authenticated.
5. Run one route analysis and verify it returns route results. Open-Meteo may rate-limit burst traffic, so repeat requests slowly during testing.

Never commit `.env`, database URLs, passwords, API keys, or production secrets. Rotate any credentials that may have been exposed in screenshots or shared archives.

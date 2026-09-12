# Job Application Game backend

## Run locally

From `backend/`:

```bash
uv sync
uv run uvicorn app.main:app --reload
```

The local API is available at `http://localhost:8000`, with interactive docs at
`http://localhost:8000/docs`.

## Verification endpoints

- `GET /api/health` checks that FastAPI is running.
- `GET /api/health/database` pings the configured MongoDB cluster.
- `GET /api/users/me` validates an Auth0 bearer access token and returns its identity.

To test the protected endpoint, obtain an access token from the frontend configured with the
audience `https://api.job-application-game.com`, then run:

```bash
curl http://localhost:8000/api/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Quality checks

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
```


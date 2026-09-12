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

## User, job, and application records

All mutation routes require an Auth0 bearer token. Identity and ownership always come from the
verified token rather than request data.

- `POST /api/users/me/profile` creates the user's app profile once during account setup. Usernames
  are 3–30 letters, numbers, or underscores, are unique without regard to case, and are immutable.
- `GET /api/users/me/profile` returns the saved profile.
- `POST /api/jobs` creates a job listing after the user has a profile.
- `GET /api/jobs` returns the newest visible listings for the bulletin board.
- `GET /api/jobs/{job_id}` returns a job listing.
- `PUT /api/users/me/applications` records an application or updates its status using a
  `job_listing_id` reference.
- `GET /api/users/me/applications` lists the current user's application records.

MongoDB uses separate `users`, `jobs`, and `job_applications` collections. Unique indexes enforce
one Auth0 subject and case-insensitive username per user, one canonical URL per job, and one
application record per user/job pair. These indexes are ensured lazily on the first database-backed
API request so the basic health endpoint remains available during a database outage.

Job creation is limited to five attempts per authenticated user per one-hour fixed window. The
counter is updated atomically in MongoDB and a limited request receives `429` with a `Retry-After`
header.

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
## Realtime multiplayer

Authenticated players first `POST /api/websocket/ticket` with their bearer token, then connect
to `/ws?ticket=...`. Tickets expire after 30 seconds and can only be used once. Player identity and
username are resolved by the server; the WebSocket never accepts them from a client message.

Client messages:

- `player.move`: `{ "position": { "x": 0, "y": 1.65, "z": 0 }, "rotation": 0 }`
- `chat.send`: `{ "text": "Hello" }`

Server messages:

- `lobby.welcome`: the connection's `self_id` and complete player snapshot
- `player.joined`, `player.moved`, `player.left`: presence and movement changes
- `chat.message`: server-attributed username, text, ID, and timestamp
- `error`: invalid input or rate-limit feedback; the connection remains usable

All messages use `{ "type": "...", "payload": { ... } }`. Lobby state and chat are intentionally
in-memory and assume one FastAPI process for the demo.

# Job Application Game

A multiplayer first-person office for browsing and sharing job listings.

## Tech stack

| Layer | |
| --- | --- |
| Frontend | SvelteKit, TypeScript, Three.js |
| Backend | FastAPI, Pydantic, Uvicorn |
| Database | MongoDB (PyMongo) |
| Auth | Auth0 |
| Realtime | FastAPI WebSockets |
| Tooling | npm, uv, pytest, ruff |

## Structure

```text
frontend/src/lib/
  api/            REST client + types
  auth/           Auth0 SPA
  components/     HUD overlays
  game/           Three.js world
    interactions/ proximity actions
    multiplayer/  WebSocket client
    npc/          lobby character
    player/       first-person controls
    rooms/        procedural office
    scene/        layout + lighting
    rendering/    post-processing

backend/app/
  api/            REST routes
  auth/           token verification
  db/             MongoDB
  models/         Pydantic schemas
  services/       LLM, rate limits
  websocket/      lobby + chat
```

REST owns jobs and profiles. WebSockets own presence, movement, and chat.

See `frontend/README.md` and `backend/README.md` for local setup.

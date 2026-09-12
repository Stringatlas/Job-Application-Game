# AGENTS.md

## Project overview

This repository contains a hackathon project for college students and new graduates: a multiplayer, first-person 3D job-discovery game. Players explore a stylized office, browse physical job boards, use in-world computers, share job listings, chat, and mark listings as stale. Actual applications always happen on the employer's external website.

The product should feel social and playful rather than like a conventional job board. The intended visual direction is a stylized, slightly eerie or horror-inspired office, but gameplay and usability take priority over visual polish.

## Priorities

Optimize for a reliable hackathon demo and fast iteration.

The core playable loop is:

1. Sign in with Auth0.
2. Enter a shared 3D office.
3. Walk to and interact with a job board.
4. Browse a crowdsourced job listing.
5. Open the employer's application page in a new tab.
6. Post, endorse, report, or mark a listing as stale.
7. See and chat with other connected players.

Build and preserve that loop before adding stretch features. Prefer the smallest clear implementation that works end to end. Avoid premature abstractions, microservices, and infrastructure that the demo does not need.

## Technology choices

- Frontend: Svelte with TypeScript
- 3D rendering: Three.js
- Backend: Python with FastAPI
- Database: MongoDB
- Authentication: Auth0
- Realtime networking: FastAPI native WebSockets
- WebSocket client: browser-native `WebSocket`
- Backend hosting: Render

Unless the repository already establishes different tools, use:

- `npm` for frontend packages
- `uv` with `pyproject.toml` for Python dependencies
- PyMongo's async API for MongoDB access; do not introduce an ODM without a concrete need
- `pytest` for backend tests
- `ruff` for Python linting and formatting
- ESLint and Prettier for TypeScript/Svelte

Do not replace these choices or add major frameworks without explaining the need first.

## Repository structure

Keep the project as a simple monorepo:

```text
frontend/
  src/
    lib/
      api/
      auth/
      components/
      game/
        interactions/
        multiplayer/
        player/
        scene/
      stores/
    routes/
  package.json

backend/
  app/
    api/
    auth/
    db/
    models/
    services/
    websocket/
    main.py
  tests/
  pyproject.toml

README.md
```

There is no cross-language `shared` package. FastAPI/Pydantic models are the source of truth for HTTP and WebSocket payload shapes. Keep matching TypeScript types near the frontend API or multiplayer code. If schema duplication becomes error-prone, generate TypeScript types from FastAPI's OpenAPI schema rather than introducing a manually maintained third schema.

## Architecture boundaries

Use REST endpoints for durable, database-oriented operations such as:

- listing and viewing jobs
- creating or editing a job
- voting that a job is useful or stale
- reporting a listing
- reading or updating the user's small app profile

Use WebSockets for realtime events such as:

- player join and leave
- position and rotation updates
- chat messages
- optional notifications that a job was added or updated

Use one FastAPI service for both REST and WebSockets. Do not create a separate multiplayer service, Socket.IO service, message broker, or Redis dependency unless a demonstrated requirement makes it necessary.

Keep ephemeral multiplayer state in server memory, including connected players, position, rotation, and current animation. Do not write movement updates to MongoDB. Store durable job and user data in MongoDB. Chat may remain ephemeral for the MVP unless persistence is explicitly required.

The initial deployment assumes one FastAPI process. If multiple instances are later introduced, in-memory multiplayer state and broadcasts will need a shared pub/sub layer; do not solve that problem prematurely.

## Frontend guidance

Keep the Svelte UI and Three.js world separated.

Three.js owns:

- the scene, camera, lighting, and renderer
- first-person movement and collision
- raycasting and interaction targets
- local and remote player representations
- world objects such as job boards and computers

Svelte/HTML owns:

- authentication screens
- menus, dialogs, and overlays
- job cards and job details
- submission and reporting forms
- chat UI
- external links and accessibility

An in-world interaction should emit a small application-level action, such as opening a job-board overlay. Do not build forms or large text interfaces directly inside the Three.js canvas.

Dispose of Three.js geometries, materials, textures, controls, event listeners, animation frames, and WebSocket subscriptions when a component or scene is destroyed. Avoid creating per-frame garbage in the render loop.

Remote movement should be interpolated between server updates. This is a social lobby, not a competitive shooter: simple position synchronization at roughly 10–20 updates per second is sufficient. Do not build prediction, rollback, or complex authoritative physics for the MVP.

## Backend guidance

Use typed Pydantic models for request bodies, responses, and WebSocket messages. Validate all client input at the server boundary. Keep route handlers thin and put reusable business logic in services only when doing so makes the code clearer.

Use explicit WebSocket message envelopes with a stable `type` field, for example:

```json
{
  "type": "player.move",
  "payload": {
    "position": { "x": 0, "y": 0, "z": 0 },
    "rotation": 0
  }
}
```

Document every new message type on both sides of the connection. Handle malformed messages without crashing the connection manager. Remove players and broadcast their departure in a `finally` block when a connection closes.

Do not trust client-provided user IDs, display names, ownership fields, vote counts, or moderation status. Derive identity from the verified Auth0 token. Add simple bounds and rate limits for movement, chat, and mutations where practical.

## Authentication and privacy

Auth0 is the only authentication system. Do not implement passwords, password reset, session storage, or a parallel custom login system.

The frontend obtains an Auth0 access token and sends it as a bearer token to protected REST endpoints. The backend verifies the token's signature, issuer, audience, and expiry using Auth0's published keys.

WebSocket connections must also authenticate before joining the world. Prefer a short-lived WebSocket ticket obtained through an authenticated REST request. If the MVP instead passes an access token during connection setup, avoid putting it in logs and document the security tradeoff. Never accept identity solely from a WebSocket payload.

Store only minimal app-specific user data, such as Auth0 subject, display name, and creation time. Do not store passwords, resumes, application answers, or sensitive applicant information. Never commit secrets. Use environment variables and maintain an `.env.example` containing names and safe placeholders only.

External application links must use `https` and open outside the app. Treat job descriptions and user-supplied text as untrusted content; render them as text rather than raw HTML.

## Job data and moderation

A minimal job record should support:

- title
- company
- location or remote status
- canonical external URL
- optional description and tags
- submitter ID
- creation and update timestamps
- status such as `active`, `possibly_stale`, or `hidden`
- useful/stale votes or separate vote records

Normalize URLs and prevent obvious duplicate listings where possible. Do not let a single user silently delete another user's listing. Prefer visible community signals and thresholds, such as showing that several users believe a listing is stale. Keep moderation rules simple and transparent for the demo.

## Stretch features

The following are out of scope until the core loop works:

- automated or scheduled job discovery
- scraping and agentic search pipelines
- local models or LLM-based eligibility scoring
- embeddings or vector databases
- elaborate avatar customization
- advanced networking or multiple world servers
- horror gameplay mechanics

If eligibility checking is added, start with explainable keyword or rule-based checks behind a backend service interface. Its output must be framed as an estimate, include reasons, and never claim to make an authoritative hiring or legal determination.

## Development workflow

Before editing:

1. Inspect the relevant files and existing conventions.
2. Identify the smallest end-to-end change that advances the core loop.
3. Avoid rewriting unrelated working code.

While editing:

- Keep changes focused and easy to review.
- Use strict TypeScript; avoid `any` unless there is a documented boundary reason.
- Add Python type hints to application code.
- Prefer readable names and direct control flow over clever abstractions.
- Add dependencies only when they materially reduce complexity; mention significant additions in the handoff.
- Preserve API and WebSocket compatibility, or update both frontend and backend together.
- Include loading, empty, error, disconnected, and reconnecting states in user-facing flows.

Before handing off:

1. Run the relevant formatter, linter, type checker, and tests.
2. Build the affected application when practical.
3. Report what changed, what was verified, and any known limitation.
4. Do not claim a command passed unless it was actually run.

For bug fixes, add a focused regression test when the logic can be tested cheaply. Do not delay a hackathon-critical visual or integration fix solely to build a large test harness.

## Suggested implementation order

When starting from an empty repository, work in this order unless asked otherwise:

1. Svelte page with a small Three.js office
2. First-person movement and one interactable job board
3. Hardcoded job-list overlay
4. FastAPI health route and MongoDB job API
5. Job submission and stale marking
6. Auth0 login and backend token verification
7. Authenticated WebSocket connection
8. Two-player join, leave, and movement synchronization
9. Text chat and reconnect handling
10. Visual polish and horror atmosphere
11. Eligibility rules or automated discovery only if time remains

At every stage, keep the application runnable and demoable.

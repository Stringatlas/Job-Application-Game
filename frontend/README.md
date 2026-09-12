# Job Application Game frontend

The app loads directly into a local, first-person Three.js office. Guests can explore the reception
area but remain offline. Approaching the access kiosk and pressing `E` opens the Auth0 login UI.
Only authenticated users should initialize future multiplayer connections.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, click the scene to capture the mouse, move with `WASD`, and interact
with the kiosk using `E`.

## Architecture

- `src/lib/game/GameWorld.ts` owns the Three.js lifecycle and connects game systems.
- `src/lib/game/player/FirstPersonController.ts` owns pointer lock and keyboard movement.
- `src/lib/game/interactions/InteractionSystem.ts` supports reusable proximity/facing interactions.
- `src/lib/game/scene/createOfficeScene.ts` creates and disposes the current office scene.
- `src/lib/auth/auth-service.ts` is the only module that talks directly to the Auth0 SPA SDK.
- `src/lib/auth/auth-store.ts` exposes authentication state to Svelte components.
- `src/lib/components/` contains DOM overlays and the Three.js viewport boundary.

## Checks

```bash
npm run check
npm run build
```

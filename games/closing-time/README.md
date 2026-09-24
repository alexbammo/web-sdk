# Closing Time

A 1–4 player co-op horror game for the browser, built from the *Haunted Shopping Centre* concept.

St Mercy Superstore is built over a graveyard. At closing time the lights fail, the shutters come down and the exit
sign reads **COMPLETE PURCHASE**. Find everything on the shopping list, carry it back through the store and scan it at
the self-checkout. When the receipt prints, the doors open and you run.

## Run it

```bash
cd games/closing-time
npm install
npm run build
npm start            # http://localhost:8080  (PORT env var to change)
```

Open the URL, pick a name and a room code, and share the room link with up to three friends. The run starts when
everyone in the lobby is ready (or someone presses *Start now*).

### Play with friends online

The server is one Node process (static client + WebSocket on the same port), so it deploys anywhere Node runs:

- **Render**: connect the repo, it picks up `render.yaml` (free plan works; the first visit after idle takes ~30s).
- **Fly.io**: `cd games/closing-time && fly launch --copy-config && fly deploy`.
- **Any Docker host**: `docker build -t closing-time . && docker run -p 8080:8080 closing-time`.
- **No hosting, just tonight**: `npm start` then `cloudflared tunnel --url http://localhost:8080` (or `ngrok http 8080`) and share the printed link.

The client connects to the WebSocket on whatever host and protocol it was served from, so HTTPS hosts work without config.

For development, run `npm start` (WebSocket server on :8080) and `npm run dev` (Vite on :5173, proxies `/ws`).

### Controls

| Key | Action |
| --- | --- |
| WASD / mouse | move / look (click to lock the mouse) |
| Shift | sprint (stamina) |
| E (hold) | pick up, scan at the till, revive a teammate, force a display case |
| Q | drop what you are carrying |
| F | torch on/off (battery drains; batteries are on the shelves) |
| Tab | hide/show the shopping list |

## How a run plays

1. **Opening**: 35 seconds of muzak and fluorescent lights. Shoppers wander. Mannequins stand in the aisles.
2. **Lockdown**: a rolling blackout. The tannoy distorts, the shutters drop and the list of five items appears. Zombies
   rise and graves break through the floor tiles.
3. **Checkout**: bring items to the self-checkout by the exit and hold E. Every beep attracts the dead, spawns more of
   them and opens more graves.
4. **Finale**: the receipt prints and the doors open. Everyone standing has 150 seconds to reach the car park.

The run is lost if everyone is down at once or the finale timer runs out.

### Items and their problems

| Item | Where | Problem |
| --- | --- | --- |
| Frozen Leg of Lamb | freezers | **bulky**: takes both hands, and you crawl along unless a teammate walks beside you |
| Engagement Ring | jewellery kiosk | **display case**: hold E for 4s to force it (noisy). This wakes the bride |
| Painkillers | pharmacy | **guarded**: taking them raises the pharmacy spirit |
| Toy Rabbit / Porcelain Doll | toys / baby aisles | **noisy**: squeaks while carried, drawing zombies |
| Church Candle | homeware | lights the carrier's way |
| Bottled Water, Roast Chicken | drinks aisle, hot deli | none |

### Threats

- **Zombies** roam, hear noise, see you in torch range and chase. A torch beam on them makes them flinch and slow down.
- **Ghost shoppers** look like ordinary late-night shoppers until you get close. Hold your torch beam on one to burn
  it away. Ghosts pass through shelving.
- **Mannequins** only move when nobody is looking at them.
- **Possessed security** patrols the aisles sweeping a torch; get caught in the beam and he runs you down.

A downed player drops everything. A teammate holds E beside them for 3 seconds to revive them, and enemies back off
briefly after knocking someone down.

## Tech

- `shared/`: store layout, nav grid, pathfinding (bucket-queue distance fields), line of sight and collision. The
  server and the client both use it.
- `server/`: Node + `ws`. An authoritative room simulation at 20 Hz covers phases, items, enemy AI, damage, revives
  and scanning. Clients own their own movement.
- `src/`: Three.js client.
  - **Lighting**: a light pool binds the 14 most relevant of ~300 real light sources (fluorescent tubes, heat lamps,
    freezer glow, emergency lights, carried candles, ghost glow) to point lights every frame.
  - An overhead shadowed key light follows the player, and shadowed torch spotlights have volumetric beam cones.
  - Post-processing: N8AO ambient occlusion, bloom, ACES tone mapping, and a grain/vignette/aberration pass.
  - The blackout rolls through the tubes from the entrance to the back wall.
  - Audio is procedural Web Audio (muzak, drones, stingers), and the tannoy/self-checkout voice uses speech synthesis.
- `src/bot.js`: an autonomous player that drives the real client input. `?bot=1` turns a tab into a bot. It claims
  items, escorts bulky carriers, revives, scans, stares down mannequins, burns ghosts with its torch and escapes.

## Tests

```bash
npm run build
npm run e2e          # 4 headless browser clients play a full run; exits 0 if the team escapes
```

Screenshots and a progress log go to `tests/out/`. `tests/views.mjs` takes a visual tour (needs a server started
with `CT_DEBUG=1`).

## Credits

3D models: [Kenney](https://kenney.nl) (CC0), taken from the Mini Market, Food, Graveyard, Mini Characters, Holiday
and Furniture kits via the [shorepine/kenney](https://github.com/shorepine/kenney) mirror. Everything else, including
textures, signage, audio and the pills/ring/battery models, is generated procedurally.

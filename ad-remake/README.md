# ad-remake

A working version of the "Claude skill that remakes video ads" workflow: a
**Claude Skill** + a dependency-free **MCP server** that turns a reference ad
and a short brief into a finished video. Claude orchestrates; a pluggable
video **provider** does the rendering.

```
reference ad ──▶ analyze_reference ──▶ plan_remake ──▶ render_remake ──▶ video
   (+ brief)        (structure)          (shot plan)      (poll job)      (url)
```

## Try it (offline, no keys, no installs)

```bash
node --test ad-remake            # run the test suite
npm --prefix ad-remake run demo  # human-readable end-to-end walkthrough
```

The demo uses a **mock provider** that simulates async render jobs, so the
whole pipeline (including the poll loop and failure paths) is exercised with
no network.

## Pieces

| File | Role |
| --- | --- |
| `src/remake.js` | Core workflow: `analyzeReference`, `planRemake`, `renderRemake`, `remakeAd` |
| `src/provider.js` | `MockProvider` (offline) + `HttpProvider` (real API seam) + `getProvider()` |
| `src/mcp-server.js` | Minimal MCP stdio server exposing the tools to Claude |
| `skill/SKILL.md` | The Claude Skill that drives the tools conversationally |
| `test/` | End-to-end + MCP handshake tests, and the demo |

## Wiring a real provider

The mock is swapped for a real service via env vars — no code changes:

```bash
export AD_REMAKE_API_URL="https://api.some-video-service.com/v1"
export AD_REMAKE_API_KEY="sk-..."
```

`HttpProvider` in `src/provider.js` expects `POST /renders` → `{ id }` and
`GET /renders/:id` → `{ status, progress, result }`. Adjust those two request
shapes to match MakeUGC / Higgsfield / Arcads / a direct Seedance endpoint.

## Register the MCP server with Claude

```json
{
  "mcpServers": {
    "ad-remake": { "command": "node", "args": ["ad-remake/src/mcp-server.js"] }
  }
}
```

Then, in chat: _"Remake this ad for my product BrewBuddy — cozy morning vibe,
CTA 'grab yours this week'"_ and Claude calls `remake_ad`.

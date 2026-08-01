---
name: ad-remake
description: Remake a video ad from a reference clip and a short brief. Use when the user wants to recreate, remake, or "make a version of" a video ad / UGC ad for a new product — they drop a reference and describe the vibe, and this drives the ad-remake MCP tools to produce a finished video. Triggers on "remake this ad", "make a UGC ad like this", "recreate this ad for my product".
---

# Ad Remake

Turn a reference ad + a plain-language brief into a finished video ad, by
driving the `ad-remake` MCP server. **You (Claude) orchestrate; the MCP
provider renders.** Don't write model prompts by hand unless asked — the
tools build them.

## When to use

The user drops one or more reference ads (a link or a description) and says
what they want a version for. Talk to them like a friend: get the *vibe*, the
*product*, and the *references*. That's enough to start.

## The three things you need

1. **Reference** — what to base the structure on. A link, or a description
   like "fast energetic TikTok, creator talks to camera, product reveal at
   the end". If they only give a vibe, that's fine.
2. **Brief** — at minimum the `product`. Optionally `vibe`, `audience`, `cta`.
3. Nothing else. No prompt engineering from the user.

## Workflow

Prefer the one-shot tool, then iterate:

1. Call **`remake_ad`** with `{ reference, brief }`. It analyzes the
   reference, plans a shot-by-shot remake for the new product, renders, and
   returns `{ refStruct, plan, result }`.
2. Show the user the **plan** (shot list) and the **result.videoUrl**.
3. **Iterate conversationally.** "Make it punchier" / "drop the problem shot"
   / "different CTA" → adjust the `brief` (or edit the `plan`) and re-call
   `render_remake` with the updated plan. Don't make them restate everything.

For finer control, use the steps individually:

- `analyze_reference { reference }` → structure (hook, tone, pacing, shots)
- `plan_remake { reference, brief }` → the render plan (inspect/tweak shots)
- `render_remake { plan }` → submits + polls until the video is ready

## Notes

- Rendering is async; `render_remake` polls internally and only returns when
  the video is done (or it throws on failure/timeout — relay that plainly).
- The offline demo uses a mock provider (returns `mock.cdn` URLs). Set
  `AD_REMAKE_API_URL` + `AD_REMAKE_API_KEY` to point at a real video service.
- Be honest about time: generation is fast, but finding good references and
  iterating to something on-brand is the real work.

## Setup (MCP registration)

Register the server with your MCP client (e.g. Claude Code):

```json
{
  "mcpServers": {
    "ad-remake": { "command": "node", "args": ["ad-remake/src/mcp-server.js"] }
  }
}
```

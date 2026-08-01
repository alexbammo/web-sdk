# adpipe

A working version of the "Claude + image gen + video gen + Meta Ads MCP" agency
workflow from the post. Four stages, one command:

```
research  →  static ads  →  video ads  →  Meta Ads publish
 (Claude)     (image gen)    (video gen)    (Graph API)
```

**Mock-first design.** Every stage runs offline with deterministic generators, so
the whole pipeline works with zero API keys. Each stage also has a real adapter
that activates automatically when the matching credential is present.

## Run it

```bash
node src/cli.mjs run examples/product.json
# artifacts land in out/<product>/
open out/brewpod/gallery.html
```

Point it at your own product by copying `examples/product.json`.

## Go live (drop in keys, same command)

| Env var | Turns on | Fallback without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Real brief + ad copy from Claude | Deterministic template brief |
| `OPENAI_API_KEY` | Real images ("GPT Image 2") | Viewable SVG placeholder ads |
| `SEEDANCE_API_KEY` | Real video jobs (Seedance) | Storyboard JSON |
| `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` | Meta Ads publish | Dry-run plan |

Meta stays **dry-run** (assembles + validates the campaign, spends nothing) unless
you also set `ADPIPE_META_LIVE=1`. Campaigns/ad sets/ads are created **PAUSED**.

```bash
ANTHROPIC_API_KEY=sk-... node src/cli.mjs run examples/product.json
node src/cli.mjs run examples/product.json --only research,static --budget 50
```

## Output

```
out/<product>/
  brief.json              # positioning, audiences, angles, competitor notes
  static/*.svg + specs    # image-ad specs + rendered creatives
  video/*.json + scripts  # UGC scripts with timed beats / storyboards
  publish/meta-campaign.json + plan.md   # campaign → ad sets → ads
  gallery.html            # everything, viewable
  summary.json
```

## How this maps to the post

| Post | Here |
|---|---|
| Step 1 research (Claude) | `stages/research.mjs` — real Claude call or mock brief |
| Step 2 static ads (GPT Image 2) | `stages/static.mjs` + `providers/image.mjs` |
| Step 3 video ads (Seedance) | `stages/video.mjs` + `providers/video.mjs` |
| Step 4 publish (Meta Ads MCP) | `stages/publish.mjs` — Graph API, dry-run guarded |

The honest gap vs. the post's pitch: the "publish + optimise on autopilot" claim.
This builds and pushes the campaign, but budget allocation and creative-testing
decisions are where real judgment lives — that loop is left as a deliberate manual
gate, not hand-waved as automatic.

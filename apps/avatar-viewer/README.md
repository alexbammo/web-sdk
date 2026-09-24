# Profile Scene: a 3D portrait from a LinkedIn photo

This app turns someone's profile photo into a 3D avatar and seats them in a live, orbitable scene. The setting, time of day, lighting warmth, accent colours and table props are chosen from how they look and what their profile says.

```
photo + profile text ─► Claude (vision + structured output) ─► scene direction
       │                                                        │
       ├─► MediaPipe (in browser) ─► instant 2.5D relief ───────┤
       └─► Meshy / Hunyuan3D / TRELLIS ─► textured GLB mesh ────┴─► three.js scene
                                                                     Poly Haven HDRIs + PBR textures
```

## Run it

```bash
cd apps/avatar-viewer
cp .env.example .env      # all keys optional
pnpm install
pnpm dev                  # web on :3010, API on :3011
```

With no keys at all it still runs. You get keyword-based scene choice and the local 2.5D avatar. Each key you add turns on one more part:

| Key | What it adds |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude reads the photo and profile text and directs the scene (setting, light, accent colour, props, caption) |
| `MESHY_API_KEY` or `FAL_KEY` | A full textured 3D mesh of the person from their photo (image-to-3D) |
| `LINKEDIN_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | A "Continue with LinkedIn" button that imports the person's name and photo |

`pnpm build && pnpm start` serves the built app and the API from a single port (:3011).

## What LinkedIn will and won't give you

This is the main constraint on the product.

- **Self-serve (works today):** [Sign In with LinkedIn using OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) with scopes `openid profile email`. You get name, profile photo URL, email and locale. That's all `server/linkedin.ts` uses.
- **Not available to normal apps:** headline, about, experience, skills and posts. Reading a member's full profile needs LinkedIn partner-program access, which is approval-gated and not granted for this kind of consumer app.
- **EU/EEA members:** the [Member Data Portability API](https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/) (a DMA requirement) lets a member authorise a third party to receive their own profile data. It's only for members in the EEA/Switzerland and needs an approved app. It's the best route to automatic "scan their profile" if your audience is European.
- **Don't scrape.** It breaks LinkedIn's User Agreement and gets accounts restricted.

So the UI signs people in with LinkedIn for the photo, then asks them to paste in their headline, about section or a few posts. Another option is to accept the PDF from LinkedIn's "Save to PDF" profile export (not built yet, but Claude reads PDFs directly).

## How the pieces work

### Scene direction (`server/analyze.ts`)

One Claude call (`claude-opus-5`) with the photo and profile text. Structured outputs (`output_config.format`) guarantee a valid `SceneDirection`:

```ts
{ scene: 'cafe'|'veranda'|'loft'|'library'|'rooftop',
  timeOfDay: 'morning'|'midday'|'golden'|'dusk'|'night',
  accentColor, warmth, props: [...], caption, reasoning }
```

The prompt tells Claude to use style cues (clothing, colour palette) and profession, and never to guess sensitive traits. Profile text is wrapped as data, not instructions. Server-side refusal fallbacks are on (`fallbacks: "default"`). If no key is set, `src/lib/heuristics.ts` does a keyword match instead. Every choice can be overridden in the UI.

### Avatar (`src/lib/avatar.ts`, `server/avatar.ts`)

- **Instant local preview.** MediaPipe's selfie segmenter cuts the person out and BlazeFace finds the face. The face box sets real-world scale (~20 cm forehead to chin), so tight headshots and half-length shots both come out life-size. The silhouette is inflated into a closed volume (distance-transform profile plus a skull ellipsoid) and cut at the chest so they sit at the table. It looks convincing within about ±60° of the front. The WASM runtime and models are self-hosted under `/mediapipe`.
- **High-quality mesh.** The server sends the photo to Meshy image-to-3D, or to fal.ai (`fal-ai/hunyuan3d/v2` by default; `fal-ai/trellis` also works). It polls the job and streams the GLB back same-origin. The viewer normalises it to a 60 cm bust, tones down over-shiny generated PBR, and has a yaw slider because generated meshes don't always face forward.
- A capsule "torso" in the sampled clothing colour fills the chair under the bust.

### Scenes and lighting (`src/lib/scenes.ts`, `sceneKit.ts`, `lighting.ts`, `viewer.ts`)

- Five procedural sets at real-world scale, all sharing one layout: hero table at the origin, sitter on −Z. The sets are café, garden veranda (pergola rafters throw striped shadows), studio loft (steel window wall), reading room (instanced bookshelves) and city rooftop (string lights).
- **Poly Haven (CC0)** HDRIs light and back every scene. PBR textures (diffuse, normal, roughness/ARM) cover floors, walls, tables and upholstery. Assets are resolved through `api.polyhaven.com/files/{id}` with candidate ID lists. A missing asset falls through to the next ID, then to a plain material, so nothing breaks offline. Outdoor scenes project the HDRI onto a `GroundedSkybox`.
- Time of day sets sun elevation, azimuth and colour temperature (blackbody), IBL strength, exposure, fog and bloom. Interiors route the sun through their windows. Warmth shifts every practical light (pendants, lamps, string lights) between 3600K and 2300K. Practicals flicker very slightly after dusk.
- ACES tone mapping, 4096² sun shadows, spot and point shadows from pendants and lamps, MSAA HDR composer with thresholded bloom. Orbit is damped and clamped so the camera can't go through the floor.

## Where to take it next

- **Full-body, seated avatar.** Image-to-3D from a headshot gives a bust. For a person truly sitting in the chair, generate a full-body reference image first (image model conditioned on the face and on Claude's outfit description), then run image-to-3D and auto-rig it (Meshy and Tripo both offer rigging). Alternatively, use a parametric avatar SDK (e.g. Avaturn) driven by the photo.
- **Gaussian splats.** For photoreal skin and hair, single-image-to-3DGS models render better than meshes. three.js can display them with `@mkkellogg/gaussian-splats-3d` or Spark.
- **Poly Haven models.** `loadModel()` is ready for props like plants, lamps and chairs. Swap them in for the procedural ones once you've picked asset IDs.
- **Profile PDF import**, share links and a video turntable export.

# Profile Scene: a 3D portrait from a LinkedIn photo

This app recreates a person as a full 3D figure from their profile photo and stands them in a live, orbitable scene. The setting, time of day, lighting warmth, accent colours and table props are chosen from how they look and what their profile says.

```
photo + profile text ─► Claude (vision + structured output) ─► scene, lighting, props, outfit
                                                                              │
headshot ─► FLUX Kontext: same person, full-length, studio light ◄────────────┘
                 │
                 └─► Meshy / Hunyuan3D / TRELLIS: textured full-body GLB ─► three.js scene
                                                                            Poly Haven HDRIs + PBR
```

## Run it

```bash
cd apps/avatar-viewer
cp .env.example .env      # all keys optional
pnpm install
pnpm dev                  # web on :3010, API on :3011
```

With no keys the scenes and scene choice still work, but there's no person in them: the 3D recreation needs a generation service. Each key you add turns on one more part:

| Key                                                | What it adds                                                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                                | Claude reads the photo and profile text and directs the scene (setting, light, accent colour, props, caption)                                                           |
| `FAL_KEY`                                          | The whole 3D recreation: headshot → full-length photo (FLUX Kontext) → 3D mesh (Hunyuan3D)                                                                              |
| `MESHY_API_KEY`                                    | Uses Meshy for the 3D mesh step instead (preferred when both are set). On its own it only works for full-length photos, because the headshot → full-body step needs fal |
| `LINKEDIN_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | A "Continue with LinkedIn" button that imports the person's name and photo                                                                                              |

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
  accentColor, warmth, props: [...], outfit, caption, reasoning }
```

The prompt tells Claude to use style cues (clothing, colour palette) and profession, and never to guess sensitive traits. Profile text is wrapped as data, not instructions. Server-side refusal fallbacks are on (`fallbacks: "default"`). If no key is set, `src/lib/heuristics.ts` does a keyword match instead. Every choice can be overridden in the UI.

### The 3D person (`server/avatar.ts`, `src/lib/avatar.ts`)

A profile photo shows a head and shoulders, and image-to-3D models only rebuild what they can see, so a headshot on its own gives a floating bust. The server runs two generative stages as one job:

1. **Full-length reference.** FLUX Kontext (`fal-ai/flux-pro/kontext`) redraws the same person head to toe, keeping face, hair, skin tone, glasses and build. They stand in a relaxed pose facing the camera, under flat studio light on a plain background, which is the input 3D reconstruction handles best. The outfit continues what they wear in the photo; Claude writes it during scene direction, and it can be edited. The UI shows this reference so you can see what the mesh is built from. Skipped if the person ticks "Photo is already full-length".
2. **Mesh.** The reference goes to Meshy image-to-3D, or to fal (`fal-ai/hunyuan3d/v2` by default, `FAL_MODEL=fal-ai/trellis` also works). The server polls the job and streams the GLB back same-origin.

The viewer scales the mesh to the person's height (a field in the UI), puts their feet on the floor beside the table, turns them towards the camera and frames them full-length. It also neutralises the glossy or metallic materials generation tends to produce. The model can be downloaded as `.glb`.

**Limits:**

- The face gets roughly 10% of the image area in a full-length reference, so facial detail in the mesh is softer than in the photo.
- Hands and the back of the head are the model's best guess.
- The mesh is a static, unrigged pose, so they stand rather than sit.

### Scenes and lighting (`src/lib/scenes.ts`, `sceneKit.ts`, `lighting.ts`, `viewer.ts`)

- Five procedural sets at real-world scale, all sharing one layout: hero table at the origin, the person standing beside it. The sets are café, garden veranda (pergola rafters throw striped shadows), studio loft (steel window wall), reading room (instanced bookshelves) and city rooftop (string lights).
- **Poly Haven (CC0)** HDRIs light and back every scene. PBR textures (diffuse, normal, roughness/ARM) cover floors, walls, tables and upholstery. Assets are resolved through `api.polyhaven.com/files/{id}` with candidate ID lists. A missing asset falls through to the next ID, then to a plain material, so nothing breaks offline. Outdoor scenes project the HDRI onto a `GroundedSkybox`.
- Time of day sets sun elevation, azimuth and colour temperature (blackbody), IBL strength, exposure, fog and bloom. Interiors route the sun through their windows. Warmth shifts every practical light (pendants, lamps, string lights) between 3600K and 2300K. Practicals flicker very slightly after dusk.
- ACES tone mapping, 4096² sun shadows, spot and point shadows from pendants and lamps, MSAA HDR composer with thresholded bloom. Orbit is damped and clamped so the camera can't go through the floor.

## Where to take it next

- **Seated pose.** Rig the mesh (Meshy and Tripo both have auto-rigging APIs), then bend hips and knees so the person sits in the chair. The table layout already has the seat position (`SITTER_Z`).
- **Sharper face.** Rebuild the head separately at high resolution from the original headshot and blend it onto the body, or use a dedicated head-avatar model.
- **Gaussian splats.** For photoreal skin and hair, single-image-to-3D Gaussian-splat models look better than meshes. three.js can show them with `@mkkellogg/gaussian-splats-3d` or Spark.
- **Choose between references.** Generate 2–3 full-length references and let the person pick before paying for the mesh.
- **Poly Haven models.** `loadModel()` is ready for props like plants, lamps and chairs.
- **Profile PDF import**, share links and a video turntable export.

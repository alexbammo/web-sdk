# Profile Scene: a 3D portrait from a LinkedIn photo

This app recreates a person in 3D from their LinkedIn photo, wearing their own clothes, in a softly lit, orbitable professional setting. It then produces a photorealistic portrait for LinkedIn: a 1:1 profile photo or a 16:9 post image. The setting, light, accent colours and props are chosen from how they look and what their profile says.

```
photo + profile text ─► Claude ─► set, light, props, and the outfit transposed from the photo
                                                             │
headshot ─► FLUX Kontext: same person, same clothes, full-length business photograph
                 ├─► FLUX Kontext: side view, back view
                 └─► Hunyuan3D multi-view / Meshy multi-image ─► textured 3D person (GLB)
                                                                   │
                                   three.js set: Poly Haven HDRIs + PBR, softbox portrait lighting
                                                                   │
                        render at 1:1 or 16:9 ─► FLUX Kontext (render + original photo)
                                                   ─► photorealistic LinkedIn portrait
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
| `FAL_KEY`                                          | The 3D recreation (full-length photo, side and back views, 3D mesh) and the photographic finish for LinkedIn images                                                     |
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
{ scene: 'office'|'cafe'|'veranda'|'loft'|'library'|'rooftop',
  timeOfDay: 'morning'|'midday'|'golden'|'dusk'|'night',
  accentColor, warmth, props: [...], outfit, caption, reasoning }
```

Claude acts as the photo director for a business portrait. It prefers soft light and keeps warmth in a range that suits skin. It uses the photo for style (clothing formality, colour palette) and the text for profession, and never guesses sensitive traits. It writes `outfit` by transposing each visible garment (colour, fabric, pattern, collar, fit) and completing what's out of frame in the same formality. Profile text is wrapped as data, not instructions. Server-side refusal fallbacks are on (`fallbacks: "default"`). If no key is set, `src/lib/heuristics.ts` does a keyword match instead. Every choice can be overridden in the UI.

### The 3D person (`server/avatar.ts`, `src/lib/avatar.ts`)

A profile photo shows a head and shoulders, and image-to-3D models only rebuild what they can see. The server runs one job with three generative stages:

1. **Full-length photograph.** FLUX Kontext (`fal-ai/flux-pro/kontext`) re-photographs the same person head to toe. It transposes their clothing exactly and keeps face, hair, skin tone, glasses and build. The prompt asks for professional business photography: 85mm, soft diffused light, plain light-grey backdrop, real photograph rather than render. The UI shows this image. Skipped if the person ticks "Photo is already full-length".
2. **Side and back views.** Kontext photographs that reference from the left and from behind, in parallel, so the 3D model doesn't have to invent the back of the head and jacket.
3. **Mesh.** All three views go to Hunyuan3D multi-view (`fal-ai/hunyuan3d/v2/multi-view`) or Meshy multi-image-to-3D. If the multi-view call fails or a view is missing, it falls back to single-view (`fal-ai/hunyuan3d/v2`, `fal-ai/trellis`, or Meshy image-to-3D). The server streams the GLB back same-origin.

The viewer scales the model to the person's height, stands them beside the table facing the camera, and neutralises the glossy or metallic materials generation tends to produce. The model can be downloaded as `.glb`.

### The LinkedIn photo (`server/finish.ts`)

A real-time mesh of a person doesn't pass for a photograph, but it gets composition, pose, set and light right. So the exported image takes two steps:

1. The viewer renders the current view off-screen at 1536 px, as 1:1 (profile photo) or 16:9 (post).
2. Multi-image Kontext (`fal-ai/flux-pro/kontext/max/multi`) gets that render plus the original photo. It turns the render into a real photograph: same framing, pose, clothes, set and light, with the person's actual face, hair and skin from their photo. If the multi-image model is unavailable, it falls back to single-image Kontext on the render.

Without `FAL_KEY` the export is the plain 3D render.

**Limits:**

- Facial detail in the 3D model is softer than in the photo, because the face is a small part of a full-length image. The photographic finish is what restores the real face in exported images.
- Hands are the model's best guess.
- The mesh is a static, unrigged pose, so they stand rather than sit.
- The finishing pass is generative. It can shift small details, so check each image before posting.

### Scenes and lighting (`src/lib/scenes.ts`, `sceneKit.ts`, `lighting.ts`, `viewer.ts`)

- Six procedural sets at real-world scale, all sharing one layout: hero table at the origin, the person standing beside it. The sets are modern office (the default: glazing, oak slat wall, meeting table), café, garden veranda, studio loft, reading room and city rooftop.
- **Poly Haven (CC0)** HDRIs light and back every scene. PBR textures (diffuse, normal, roughness/ARM) cover floors, walls, tables and upholstery. Assets are resolved through `api.polyhaven.com/files/{id}` with candidate ID lists. A missing asset falls through to the next ID, then to a plain material, so nothing breaks offline. Outdoor scenes project the HDRI onto a `GroundedSkybox`.
- **Soft, business-portrait lighting.**
  - Most light comes from the sky (the HDRI) and from three area-light softboxes that travel with the person: a large key front-left above eye line, a weaker fill front-right, and a rim light behind.
  - The sun is a gentle accent, and variance shadow maps keep its shadows diffused.
  - Softbox colour is daylight, nudged between 5600K and 4300K by warmth.
- **Portrait camera.** Once the person is in, the default framing is waist-up on an ~85mm lens, just above eye level. Depth of field keeps focus locked on the face and softly blurs the set. "Full scene" switches to a ~50mm wide shot.
- Time of day sets sun angle and colour temperature, sky strength, exposure, fog and bloom. Interiors route the sun through their windows. Warmth shifts every practical light between 3600K and 2300K.
- ACES tone mapping, MSAA HDR composer, thresholded bloom. Orbit is damped and clamped so the camera can't go through the floor.

## Where to take it next

- **Seated pose.** Rig the mesh (Meshy and Tripo both have auto-rigging APIs), then bend hips and knees so the person sits in the chair. The table layout already has the seat position (`SITTER_Z`).
- **Sharper face.** Rebuild the head separately at high resolution from the original headshot and blend it onto the body, or use a dedicated head-avatar model.
- **Gaussian splats.** For photoreal skin and hair, single-image-to-3D Gaussian-splat models look better than meshes. three.js can show them with `@mkkellogg/gaussian-splats-3d` or Spark.
- **Choose between finishes.** Generate 2–3 photographic finishes per shot and let the person pick; likewise for the full-length reference before paying for the mesh.
- **Poly Haven models.** `loadModel()` is ready for props like plants, lamps and chairs.
- **Profile PDF import**, share links and a video turntable export.

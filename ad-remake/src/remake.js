// Core "remake a video ad" workflow.
//
// This is the logic a Claude Skill drives conversationally. It is
// deliberately plain data-in / data-out so it can be called from a test,
// from the MCP server, or straight from a Claude tool call.
//
// Pipeline:
//   analyzeReference(ref)     -> reference structure (hook, shots, pacing)
//   planRemake(refStruct,brief) -> a shot-by-shot render plan for the NEW product
//   renderRemake(plan, provider) -> submits + polls the provider -> finished video
//
// remakeAd() runs all three.

/**
 * Analyze a reference ad into a reusable structure.
 *
 * A real implementation would run a vision model over the video. Here we
 * accept either an already-structured reference or a light descriptor and
 * normalize it into { hook, tone, shots: [{ role, durationSec, beat }] }.
 */
export function analyzeReference(ref) {
  if (ref == null) throw new Error('analyzeReference: ref is required');

  // Already structured? Trust it (after validation).
  if (Array.isArray(ref.shots) && ref.shots.length > 0) {
    return {
      hook: ref.hook ?? ref.shots[0].beat ?? 'Opening hook',
      tone: ref.tone ?? 'energetic',
      pacing: ref.pacing ?? 'fast',
      shots: ref.shots.map((s, i) => ({
        role: s.role ?? (i === 0 ? 'hook' : i === ref.shots.length - 1 ? 'cta' : 'body'),
        durationSec: s.durationSec ?? 3,
        beat: s.beat ?? `Beat ${i + 1}`,
      })),
    };
  }

  // Otherwise synthesize a canonical 5-shot UGC structure from the descriptor.
  const tone = ref.tone ?? 'energetic';
  const pacing = ref.pacing ?? 'fast';
  const subject = ref.subject ?? ref.description ?? 'the product';
  return {
    hook: ref.hook ?? `Wait, you're still not using ${subject}?`,
    tone,
    pacing,
    shots: [
      { role: 'hook', durationSec: 2, beat: `Creator delivers the hook to camera about ${subject}` },
      { role: 'problem', durationSec: 2, beat: 'Show the pain point / status quo' },
      { role: 'reveal', durationSec: 3, beat: `Reveal ${subject} as the fix` },
      { role: 'proof', durationSec: 2, beat: 'Quick demo / result / reaction' },
      { role: 'cta', durationSec: 1, beat: 'Call to action + product beauty shot' },
    ],
  };
}

/**
 * Map a reference structure onto a new product/brief, producing a render plan.
 *
 * brief: { product, vibe?, audience?, cta?, references?: string[] }
 */
export function planRemake(refStruct, brief) {
  if (!brief || !brief.product) {
    throw new Error('planRemake: brief.product is required');
  }
  const vibe = brief.vibe ?? refStruct.tone;
  const cta = brief.cta ?? `Try ${brief.product} today`;

  const shots = refStruct.shots.map((shot, i) => {
    const beat =
      shot.role === 'cta'
        ? `${cta}. Beauty shot of ${brief.product}.`
        : shot.beat.replace(/the product|\bit\b/gi, brief.product);
    return {
      index: i,
      role: shot.role,
      durationSec: shot.durationSec,
      prompt: renderShotPrompt({ beat, vibe, audience: brief.audience, product: brief.product }),
    };
  });

  return {
    meta: {
      product: brief.product,
      vibe,
      audience: brief.audience ?? 'general',
      basedOn: brief.references ?? [],
      shotCount: shots.length,
    },
    shots,
  };
}

function renderShotPrompt({ beat, vibe, audience, product }) {
  const parts = [
    beat,
    `Style: ${vibe} UGC ad`,
    audience ? `Audience: ${audience}` : null,
    `Product: ${product}`,
    'Vertical 9:16, natural lighting, handheld feel.',
  ].filter(Boolean);
  return parts.join(' | ');
}

/**
 * Submit a plan to the provider and poll until the job settles.
 *
 * Returns the provider's `result` on success. Throws on failure/timeout.
 */
export async function renderRemake(plan, provider, { maxPolls = 30, onProgress } = {}) {
  const { jobId } = await provider.submitRender(plan);

  for (let i = 0; i < maxPolls; i++) {
    const job = await provider.getJob(jobId);
    if (onProgress) onProgress(job);

    if (job.status === 'done') return { jobId, ...job.result };
    if (job.status === 'failed') {
      throw new Error(job.error ?? `render job ${jobId} failed`);
    }
  }
  throw new Error(`render job ${jobId} did not finish within ${maxPolls} polls`);
}

/**
 * End-to-end convenience: reference + brief -> finished video.
 */
export async function remakeAd({ reference, brief, provider, onProgress } = {}) {
  const refStruct = analyzeReference(reference);
  const plan = planRemake(refStruct, brief);
  const result = await renderRemake(plan, provider, { onProgress });
  return { refStruct, plan, result };
}

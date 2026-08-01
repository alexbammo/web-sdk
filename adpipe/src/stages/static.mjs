import { config } from '../config.mjs';
import { callClaudeJSON } from '../llm.mjs';
import { generateImage } from '../providers/image.mjs';
import { writeOut, slug, log } from '../util.mjs';

const SYSTEM = `You are a direct-response creative director. Turn brand angles into
static image-ad specs that stop the scroll.`;

function userPrompt(brief) {
  return `Brand brief:
${JSON.stringify(brief, null, 2)}

For each angle, write ONE image-ad spec. Return a JSON array:
[{
  "angle": "",
  "concept": "visual idea in one line",
  "composition": "what's in frame",
  "style": "art direction / lighting / mood",
  "aspect_ratio": "1:1 | 4:5 | 9:16",
  "copy_overlay": {"headline":"<=6 words", "subhead":"<=12 words", "cta":"<=3 words"},
  "render_prompt": "a full text-to-image prompt"
}]`;
}

function mockSpecs(brief) {
  const ratios = ['1:1', '4:5', '9:16', '4:5'];
  return brief.angles.map((angle, i) => ({
    angle: angle.name,
    concept: angle.big_idea,
    composition: `Product hero centered, ${brief.tone[0]} styling, generous negative space`,
    style: `${brief.tone.join(', ')} · soft studio light · brand-color accents`,
    aspect_ratio: ratios[i % ratios.length],
    copy_overlay: {
      headline: shorten(angle.hook, 6),
      subhead: shorten(angle.proof ? `Proof: ${angle.proof}` : brief.value_props[0], 12),
      cta: 'Try it',
    },
    render_prompt: `Advertising photograph. ${angle.big_idea}. ${brief.positioning}. Style: ${brief.tone.join(', ')}. Clean composition, high detail, commercial lighting.`,
  }));
}

export async function staticAds(brief, outDir) {
  const specs = config.llm.mode === 'real' ? await callClaudeJSON(SYSTEM, userPrompt(brief), { maxTokens: 2500 }) : mockSpecs(brief);
  const creatives = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const file = `${outDir}/static/${String(i + 1).padStart(2, '0')}-${slug(spec.angle || spec.concept)}.svg`;
    const path = await generateImage(spec, file);
    log('ok', `static ad ${i + 1}: ${spec.copy_overlay?.headline} → ${path.split('/').slice(-2).join('/')}`);
    creatives.push({ type: 'image', spec, file: path });
  }
  await writeOut(`${outDir}/static/specs.json`, specs);
  return creatives;
}

const shorten = (s = '', n) => s.split(' ').slice(0, n).join(' ').replace(/[?.!]+$/, '');

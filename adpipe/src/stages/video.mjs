import { config } from '../config.mjs';
import { callClaudeJSON } from '../llm.mjs';
import { generateVideo } from '../providers/video.mjs';
import { writeOut, slug, log } from '../util.mjs';

const SYSTEM = `You are a UGC ad writer. Write short-form video scripts (15-20s) that
feel like a real person, not an ad. Punchy hook in the first 2 seconds.`;

function userPrompt(brief) {
  return `Brand brief:
${JSON.stringify(brief, null, 2)}

Write a UGC-style script for the two strongest angles. Return a JSON array:
[{
  "angle": "",
  "format": "talking head | product demo | before/after",
  "aspect_ratio": "9:16",
  "duration_s": 18,
  "beats": [{"seconds": 2, "visual": "", "vo": "", "overlay": ""}],
  "render_prompt": "text-to-video prompt describing the scene, actor, motion"
}]`;
}

function mockScripts(brief) {
  const top = brief.angles.slice(0, 2);
  return top.map((angle) => ({
    angle: angle.name,
    format: 'talking head',
    aspect_ratio: '9:16',
    duration_s: 18,
    beats: [
      { seconds: 2, visual: 'Person mid-motion, phone-shot, natural light', vo: angle.hook, overlay: angle.hook },
      { seconds: 5, visual: 'Cut to product in use, close-up', vo: brief.value_props[0], overlay: '' },
      { seconds: 6, visual: 'Reaction / result shot', vo: `Here's what changed: ${brief.value_props[1]}`, overlay: brief.value_props[1] },
      { seconds: 5, visual: 'Product beauty shot + logo', vo: `${brief.positioning.split('—')[0].trim()}.`, overlay: 'Try it →' },
    ],
    render_prompt: `Vertical UGC ad. A relatable person talks to camera about ${angle.big_idea}. ${brief.tone.join(', ')} tone. Handheld, natural lighting, authentic. Product appears mid-clip.`,
  }));
}

export async function videoAds(brief, outDir) {
  const scripts = config.llm.mode === 'real' ? await callClaudeJSON(SYSTEM, userPrompt(brief), { maxTokens: 2500 }) : mockScripts(brief);
  const creatives = [];
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const file = `${outDir}/video/${String(i + 1).padStart(2, '0')}-${slug(script.angle)}.json`;
    const result = await generateVideo(script, file);
    log('ok', `video ${i + 1}: "${script.beats[0].vo}" (${result.total_s ?? '?'}s)`);
    creatives.push({ type: 'video', script, ...result, file });
  }
  await writeOut(`${outDir}/video/scripts.json`, scripts);
  return creatives;
}

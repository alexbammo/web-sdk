import { config } from '../config.mjs';
import { writeOut } from '../util.mjs';

/**
 * Mock: writes a storyboard JSON + a WebVTT-style shot list (inspectable).
 * Real: submits the prompt to a video model (Seedance-style async job API).
 */
async function realVideo(script, outPath) {
  const res = await fetch(`${config.video.baseUrl || 'https://api.seedance.example'}/v1/videos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.video.key}` },
    body: JSON.stringify({ model: config.video.model, prompt: script.render_prompt, duration: script.duration_s, aspect_ratio: script.aspect_ratio }),
  });
  if (!res.ok) throw new Error(`Video API ${res.status}: ${await res.text()}`);
  const job = await res.json();
  await writeOut(outPath.replace(/\.json$/, '.job.json'), job);
  return { jobId: job.id, status: job.status || 'queued' };
}

function storyboard(script) {
  let t = 0;
  const shots = script.beats.map((beat, i) => {
    const start = t;
    t += beat.seconds;
    return { shot: i + 1, start_s: start, end_s: t, on_screen: beat.visual, vo: beat.vo, text_overlay: beat.overlay || '' };
  });
  return { ...script, total_s: t, shots };
}

export async function generateVideo(script, outPath) {
  if (config.video.mode === 'real') return realVideo(script, outPath);
  const board = storyboard(script);
  await writeOut(outPath, board);
  return { storyboard: outPath, total_s: board.total_s };
}

import { config } from '../config.mjs';
import { writeOut, hash, pick } from '../util.mjs';

const PALETTES = [
  ['#0f172a', '#38bdf8', '#f8fafc'],
  ['#1a1a2e', '#e94560', '#f5f5f5'],
  ['#052e16', '#4ade80', '#f0fdf4'],
  ['#2e1065', '#c084fc', '#faf5ff'],
];

const SIZES = {
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
};

/** Renders a real, viewable SVG so mock creatives are inspectable, not empty. */
function renderPlaceholder(spec) {
  const [w, h] = SIZES[spec.aspect_ratio] || SIZES['1:1'];
  const [bg, accent, fg] = pick(PALETTES, hash(spec.concept));
  const headline = escapeXml(spec.copy_overlay?.headline || spec.concept);
  const sub = escapeXml(spec.copy_overlay?.subhead || '');
  const cta = escapeXml(spec.copy_overlay?.cta || 'Shop now');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <circle cx="${w * 0.8}" cy="${h * 0.22}" r="${w * 0.28}" fill="${accent}" opacity="0.18"/>
  <rect x="${w * 0.08}" y="${h * 0.12}" width="${w * 0.5}" height="10" rx="5" fill="${accent}"/>
  <text x="${w * 0.08}" y="${h * 0.42}" font-family="Arial, sans-serif" font-size="${w * 0.09}" font-weight="800" fill="${fg}">
    ${wrap(headline, 18).map((line, i) => `<tspan x="${w * 0.08}" dy="${i === 0 ? 0 : w * 0.11}">${line}</tspan>`).join('')}
  </text>
  <text x="${w * 0.08}" y="${h * 0.62}" font-family="Arial, sans-serif" font-size="${w * 0.038}" fill="${fg}" opacity="0.85">
    ${wrap(sub, 40).map((line, i) => `<tspan x="${w * 0.08}" dy="${i === 0 ? 0 : w * 0.05}">${line}</tspan>`).join('')}
  </text>
  <rect x="${w * 0.08}" y="${h * 0.78}" width="${w * 0.42}" height="${h * 0.07}" rx="${h * 0.035}" fill="${accent}"/>
  <text x="${w * 0.29}" y="${h * 0.78 + h * 0.047}" font-family="Arial, sans-serif" font-size="${w * 0.035}" font-weight="700" fill="${bg}" text-anchor="middle">${cta}</text>
  <text x="${w * 0.08}" y="${h * 0.95}" font-family="Arial, sans-serif" font-size="${w * 0.022}" fill="${fg}" opacity="0.5">MOCK CREATIVE · ${spec.aspect_ratio} · adpipe</text>
</svg>`;
}

async function realImage(spec, outPath) {
  const res = await fetch(`${config.image.baseUrl || 'https://api.openai.com'}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.image.key}` },
    body: JSON.stringify({ model: config.image.model, prompt: spec.render_prompt, size: '1024x1024', n: 1 }),
  });
  if (!res.ok) throw new Error(`Image API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  const png = outPath.replace(/\.svg$/, '.png');
  await writeOut(png, Buffer.from(b64, 'base64').toString('binary'));
  return png;
}

export async function generateImage(spec, outPath) {
  if (config.image.mode === 'real') return realImage(spec, outPath);
  await writeOut(outPath, renderPlaceholder(spec));
  return outPath;
}

const escapeXml = (s = '') => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
function wrap(s, n) {
  const words = String(s).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > n) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 4);
}

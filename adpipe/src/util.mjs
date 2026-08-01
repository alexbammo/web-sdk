import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Deterministic tiny hash -> used to vary mock output per input (no Math.random). */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick(arr, seed) {
  return arr[seed % arr.length];
}

export function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function writeOut(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const data = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2);
  await writeFile(path, data);
  return path;
}

export function log(step, msg) {
  const tag = { info: '·', ok: '✓', warn: '!', run: '▸' }[step] ?? '·';
  console.log(`  ${tag} ${msg}`);
}

export function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

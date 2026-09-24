// End-to-end co-op test: four real browser clients (bot-driven) join one room and play a full run.
// Starts its own server unless BASE is given. Exits 0 only if the run ends with the team escaping.
//   node tests/e2e.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });
const PORT = process.env.PORT || 8090;
let base = process.env.BASE;
let server;
if (!base) {
	server = spawn(process.execPath, [path.join(here, '../server/server.js')], { env: { ...process.env, PORT }, stdio: 'inherit' });
	base = `http://localhost:${PORT}`;
	await new Promise((r) => setTimeout(r, 1000));
}
const TIMEOUT = +(process.env.TIMEOUT || 20 * 60) * 1000;
const room = 'E2E' + (Date.now() % 10000);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const pages = [];
for (let i = 0; i < 4; i++) {
	const hq = i === 0 && process.env.HQ !== '0';
	const ctx = await browser.newContext({ viewport: hq ? { width: 960, height: 540 } : { width: 480, height: 270 } });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => console.log(`[bot${i + 1} pageerror]`, e.message));
	page.on('console', (m) => m.type() === 'error' && console.log(`[bot${i + 1} console]`, m.text()));
	const q = hq ? 'high&renderEvery=100000' : 'low&renderEvery=100000';
	await page.goto(`${base}/?bot=1&room=${room}&name=Bot${i + 1}&q=${q}`);
	pages.push(page);
}
console.log(`4 bots joining room ${room}`);

const t0 = Date.now();
let shot = 0;
let lastShotPhase = '';
let result = null;
let lastLog = 0;
const summary = [];
while (Date.now() - t0 < TIMEOUT) {
	await new Promise((r) => setTimeout(r, 2000));
	const states = await Promise.all(
		pages.map((p) =>
			p
				.evaluate(() => ({
					id: game.id,
					phase: game.phase,
					sc: game.snap?.sc,
					list: game.snap?.list,
					me: { x: +game.me.x.toFixed(1), z: +game.me.z.toFixed(1), hp: game.me.hp, bat: game.me.battery, dn: game.me.downed, es: game.me.escaped, carry: game.me.carrying?.length },
					note: game.bot?.note,
					res: game.snap?.res,
					frames: game.stats.frames,
					enemies: game.snap?.E?.length
				}))
				.catch((e) => ({ err: e.message }))
		)
	);
	const s = states[0];
	const now = Math.round((Date.now() - t0) / 1000);
	if (now - lastLog >= 10) {
		lastLog = now;
		const line = `[${now}s] phase=${s.phase} scanned=${s.sc ?? '-'}/${s.list?.length ?? '-'} enemies=${s.enemies} | ` + states.map((b, i) => `B${i + 1}${b.me?.dn ? '(DOWN)' : ''}${b.me?.es ? '(OUT)' : ''} hp=${Math.round(b.me?.hp ?? 0)} bat=${b.me?.bat} c=${b.me?.carry} ${b.note || ''} @${b.me?.x},${b.me?.z}`).join(' | ');
		console.log(line);
		summary.push(line);
	}
	// screenshots: on every phase change and every ~40s
	if (s.phase !== lastShotPhase || now % 40 < 2) {
		lastShotPhase = s.phase;
		const file = path.join(outDir, `e2e-${String(shot++).padStart(2, '0')}-${s.phase}.png`);
		await pages[0].evaluate(() => game.render()).catch(() => {});
		await pages[0].screenshot({ path: file }).catch(() => {});
	}
	if (s.phase === 'ended' && s.res) {
		result = s.res;
		break;
	}
}
for (const [i, p] of pages.entries())
	await p
		.evaluate(() => game.render())
		.then(() => p.screenshot({ path: path.join(outDir, `final-bot${i + 1}.png`) }))
		.catch(() => {});
await browser.close();
server?.kill();
fs.writeFileSync(path.join(outDir, 'summary.txt'), summary.join('\n') + '\n' + JSON.stringify(result, null, 2));
console.log('RESULT', JSON.stringify(result));
process.exit(result?.won ? 0 : 1);

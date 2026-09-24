// Visual tour: joins a room as a single player and captures screenshots from several viewpoints.
// Server must run with CT_DEBUG=1.  node tests/views.mjs <outdir> [prefix]
import { chromium } from 'playwright';
const [outDir, prefix = 'v', base = 'http://localhost:8080'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
await page.goto(`${base}/?room=VIEW${Date.now() % 10000}&name=Viewer`);
await page.waitForFunction(() => window.game?.ready, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById('join').click());
await page.waitForFunction(() => window.game?.id);
await page.evaluate(() => game.send({ t: 'start' }));
await page.waitForFunction(() => game.phase === 'opening');
const views = JSON.parse(process.env.VIEWS || '[]');
for (const [i, v] of views.entries()) {
	if (v.do) await page.evaluate((d) => game.send({ t: 'debug', do: d }), v.do);
	await page.evaluate((v) => Object.assign(game.me, { x: v.x, z: v.z, yaw: v.yaw ?? Math.PI, pitch: v.pitch ?? 0, torch: v.torch ?? game.me.torch }), v);
	await page.waitForTimeout(v.wait || 3000);
	await page.screenshot({ path: `${outDir}/${prefix}${i}.png` });
	console.log('shot', i, v.name || '');
}
await browser.close();

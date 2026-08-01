// Human-readable end-to-end demo. Run: npm --prefix ad-remake run demo
import { remakeAd } from '../src/remake.js';
import { getProvider } from '../src/provider.js';

const provider = getProvider(); // MockProvider unless AD_REMAKE_API_* is set

const out = await remakeAd({
  reference: {
    subject: 'the product',
    tone: 'energetic',
    pacing: 'fast',
  },
  brief: {
    product: 'BrewBuddy',
    vibe: 'cozy morning',
    audience: 'coffee lovers',
    cta: 'Grab yours this week',
    references: ['tiktok.com/@someone/video/123'],
  },
  provider,
  onProgress: (job) =>
    console.log(`  [${job.status.padEnd(9)}] progress=${(job.progress * 100).toFixed(0)}%`),
});

console.log('\n=== REFERENCE STRUCTURE ===');
console.log(`hook: ${out.refStruct.hook}`);
console.log(`tone: ${out.refStruct.tone} | pacing: ${out.refStruct.pacing}`);

console.log('\n=== REMAKE PLAN ===');
for (const s of out.plan.shots) {
  console.log(`  #${s.index} (${s.role}, ${s.durationSec}s): ${s.prompt}`);
}

console.log('\n=== FINISHED VIDEO ===');
console.log(`url: ${out.result.videoUrl}`);
console.log(`duration: ${out.result.durationSec}s | shots: ${out.result.shots.length}`);

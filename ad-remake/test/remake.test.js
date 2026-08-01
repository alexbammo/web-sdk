import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeReference, planRemake, renderRemake, remakeAd } from '../src/remake.js';
import { MockProvider } from '../src/provider.js';

test('analyzeReference synthesizes a 5-shot structure from a light descriptor', () => {
  const s = analyzeReference({ subject: 'GlowSerum', tone: 'calm' });
  assert.equal(s.tone, 'calm');
  assert.equal(s.shots.length, 5);
  assert.equal(s.shots[0].role, 'hook');
  assert.equal(s.shots.at(-1).role, 'cta');
});

test('analyzeReference preserves an already-structured reference', () => {
  const s = analyzeReference({
    hook: 'POV: your desk finally makes sense',
    tone: 'aesthetic',
    shots: [
      { role: 'hook', durationSec: 2, beat: 'hook' },
      { role: 'cta', durationSec: 1, beat: 'buy now' },
    ],
  });
  assert.equal(s.shots.length, 2);
  assert.equal(s.hook, 'POV: your desk finally makes sense');
});

test('planRemake maps shots onto the new product and builds prompts', () => {
  const ref = analyzeReference({ subject: 'the product' });
  const plan = planRemake(ref, { product: 'DeskPal', vibe: 'aesthetic', audience: 'WFH creators' });
  assert.equal(plan.meta.product, 'DeskPal');
  assert.equal(plan.shots.length, 5);
  for (const shot of plan.shots) {
    assert.match(shot.prompt, /DeskPal/);
    assert.match(shot.prompt, /9:16/);
  }
  // CTA shot uses the brief's implied CTA
  assert.match(plan.shots.at(-1).prompt, /DeskPal/);
});

test('planRemake requires a product', () => {
  const ref = analyzeReference({ subject: 'x' });
  assert.throws(() => planRemake(ref, {}), /product is required/);
});

test('renderRemake polls the provider to completion', async () => {
  const provider = new MockProvider({ ticksToComplete: 3 });
  const ref = analyzeReference({ subject: 'the product' });
  const plan = planRemake(ref, { product: 'Zap' });

  const progress = [];
  const result = await renderRemake(plan, provider, { onProgress: (j) => progress.push(j.status) });

  assert.match(result.videoUrl, /final\.mp4$/);
  assert.equal(result.shots.length, 5);
  assert.ok(result.durationSec > 0);
  // Should have gone through intermediate states before done.
  assert.ok(progress.length >= 3);
  assert.equal(progress.at(-1), 'done');
});

test('renderRemake surfaces provider failures', async () => {
  const provider = new MockProvider({ ticksToComplete: 2, failShotText: 'Zap' });
  const ref = analyzeReference({ subject: 'the product' });
  const plan = planRemake(ref, { product: 'Zap' });
  await assert.rejects(renderRemake(plan, provider), /render failed/);
});

test('renderRemake times out if the job never settles', async () => {
  const provider = new MockProvider({ ticksToComplete: 999 });
  const ref = analyzeReference({ subject: 'the product' });
  const plan = planRemake(ref, { product: 'Slow' });
  await assert.rejects(renderRemake(plan, provider, { maxPolls: 3 }), /did not finish/);
});

test('remakeAd runs the full pipeline end-to-end', async () => {
  const provider = new MockProvider({ ticksToComplete: 2 });
  const out = await remakeAd({
    reference: { subject: 'the product', tone: 'energetic' },
    brief: { product: 'FocusTea', vibe: 'cozy', audience: 'students', cta: 'Grab a tin' },
    provider,
  });
  assert.equal(out.plan.meta.product, 'FocusTea');
  assert.match(out.result.videoUrl, /final\.mp4$/);
  assert.match(out.plan.shots.at(-1).prompt, /Grab a tin/);
});

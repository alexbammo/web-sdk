// Video-generation provider interface.
//
// The workflow talks to a *provider* through this small surface so the
// orchestration logic never cares whether it is hitting a mock, MakeUGC,
// Higgsfield, or a raw Seedance endpoint.
//
//   submitRender(plan)        -> { jobId }
//   getJob(jobId)             -> { jobId, status, progress, result }
//
// status is one of: 'queued' | 'rendering' | 'done' | 'failed'
// result (present when done): { videoUrl, durationSec, shots }

/**
 * Tiny deterministic PRNG (mulberry32) so mock output is stable across runs
 * and tests don't flake. Seeded from a string.
 */
function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * MockProvider — simulates an async render job without any network.
 *
 * Each job needs `ticksToComplete` calls to getJob() before it flips to
 * 'done', so the poll loop is exercised for real. Fully deterministic.
 */
export class MockProvider {
  constructor({ ticksToComplete = 3, failShotText = null } = {}) {
    this.ticksToComplete = ticksToComplete;
    this.failShotText = failShotText; // if a shot prompt includes this, fail the job
    this.jobs = new Map();
    this.counter = 0;
  }

  async submitRender(plan) {
    const rnd = seededRandom(JSON.stringify(plan.shots.map((s) => s.prompt)));
    const jobId = `mock_${(++this.counter).toString().padStart(4, '0')}_${Math.floor(rnd() * 1e6)}`;

    const willFail =
      this.failShotText != null &&
      plan.shots.some((s) => s.prompt.includes(this.failShotText));

    this.jobs.set(jobId, {
      jobId,
      status: 'queued',
      ticks: 0,
      willFail,
      plan,
    });
    return { jobId };
  }

  async getJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`unknown jobId: ${jobId}`);

    job.ticks += 1;
    const progress = Math.min(1, job.ticks / this.ticksToComplete);

    if (job.ticks < this.ticksToComplete) {
      job.status = job.ticks === 1 ? 'queued' : 'rendering';
      return { jobId, status: job.status, progress, result: null };
    }

    if (job.willFail) {
      job.status = 'failed';
      return {
        jobId,
        status: 'failed',
        progress: 1,
        error: 'render failed: flagged shot could not be generated',
        result: null,
      };
    }

    job.status = 'done';
    const shots = job.plan.shots.map((s, i) => ({
      index: i,
      durationSec: s.durationSec,
      clipUrl: `https://mock.cdn/ad/${jobId}/shot_${i}.mp4`,
    }));
    const durationSec = shots.reduce((sum, s) => sum + s.durationSec, 0);
    return {
      jobId,
      status: 'done',
      progress: 1,
      result: {
        videoUrl: `https://mock.cdn/ad/${jobId}/final.mp4`,
        durationSec,
        shots,
      },
    };
  }
}

/**
 * HttpProvider — skeleton for a real MCP-backed video service.
 *
 * Fill in `baseUrl` / `apiKey` and the two request shapes to point this at
 * MakeUGC, Higgsfield, Arcads, or a direct Seedance endpoint. Left unwired
 * on purpose so the demo runs offline; throws if used without config.
 */
export class HttpProvider {
  constructor({ baseUrl, apiKey, fetchImpl = globalThis.fetch } = {}) {
    if (!baseUrl || !apiKey) {
      throw new Error(
        'HttpProvider needs { baseUrl, apiKey }. Set AD_REMAKE_API_URL and AD_REMAKE_API_KEY to use a real provider.',
      );
    }
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async submitRender(plan) {
    const res = await this.fetch(`${this.baseUrl}/renders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ shots: plan.shots, meta: plan.meta }),
    });
    if (!res.ok) throw new Error(`submitRender failed: ${res.status}`);
    const data = await res.json();
    return { jobId: data.id ?? data.jobId };
  }

  async getJob(jobId) {
    const res = await this.fetch(`${this.baseUrl}/renders/${jobId}`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`getJob failed: ${res.status}`);
    return res.json();
  }
}

/**
 * Pick a provider from env. Defaults to the offline mock.
 */
export function getProvider(env = process.env) {
  if (env.AD_REMAKE_API_URL && env.AD_REMAKE_API_KEY) {
    return new HttpProvider({
      baseUrl: env.AD_REMAKE_API_URL,
      apiKey: env.AD_REMAKE_API_KEY,
    });
  }
  return new MockProvider();
}

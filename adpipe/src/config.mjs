/**
 * Central config. Every stage runs in `mock` mode unless the matching real
 * credential is present, in which case it flips to `real` automatically.
 * This is what lets the whole pipeline run offline with zero keys, yet go
 * live the instant you export the tokens.
 */
export const config = {
  llm: {
    key: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ADPIPE_MODEL || 'claude-sonnet-5',
    baseUrl: 'https://api.anthropic.com',
    get mode() {
      return this.key ? 'real' : 'mock';
    },
  },
  image: {
    key: process.env.OPENAI_API_KEY || '',
    // "GPT Image 2" in the post == OpenAI image generation endpoint.
    model: process.env.ADPIPE_IMAGE_MODEL || 'gpt-image-1',
    get mode() {
      return this.key ? 'real' : 'mock';
    },
  },
  video: {
    key: process.env.SEEDANCE_API_KEY || '',
    model: process.env.ADPIPE_VIDEO_MODEL || 'seedance-2.0',
    get mode() {
      return this.key ? 'real' : 'mock';
    },
  },
  meta: {
    token: process.env.META_ACCESS_TOKEN || '',
    adAccountId: process.env.META_AD_ACCOUNT_ID || '',
    // Safety: never actually spends money unless explicitly turned off.
    dryRun: process.env.ADPIPE_META_LIVE !== '1',
    get mode() {
      return this.token && this.adAccountId ? 'real' : 'mock';
    },
  },
};

export function modeReport() {
  return {
    research: config.llm.mode,
    static: `llm:${config.llm.mode} image:${config.image.mode}`,
    video: `llm:${config.llm.mode} video:${config.video.mode}`,
    publish: `meta:${config.meta.mode}${config.meta.mode === 'real' && config.meta.dryRun ? ' (dry-run)' : ''}`,
  };
}

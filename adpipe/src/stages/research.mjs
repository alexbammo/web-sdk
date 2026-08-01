import { config } from '../config.mjs';
import { callClaudeJSON } from '../llm.mjs';
import { hash, pick } from '../util.mjs';

const SYSTEM = `You are a senior DTC brand strategist. Given a product, produce a
tight brand brief a performance-marketing team can act on immediately.`;

function userPrompt(product) {
  return `Product:
name: ${product.name}
category: ${product.category}
description: ${product.description}
price: ${product.price ?? 'n/a'}
url: ${product.url ?? 'n/a'}
competitors: ${(product.competitors || []).join(', ') || 'n/a'}

Return JSON with this shape:
{
  "positioning": "one sentence",
  "value_props": ["3-5 short props"],
  "audiences": [{"name":"", "who":"", "pain":"", "trigger":""}],
  "angles": [{"name":"", "big_idea":"", "hook":"", "proof":""}],
  "competitor_notes": [{"name":"", "weakness_to_exploit":""}],
  "tone": ["3-4 adjectives"]
}
Give 3 audiences and 4 angles.`;
}

/** Deterministic offline brief. Derives real content from the product fields. */
function mockBrief(product) {
  const seed = hash(product.name + product.category);
  const painBank = [
    'wasting money on options that underdeliver',
    'not enough time to research the right choice',
    'burned before by overhyped alternatives',
    'juggling too many tools that half-work',
  ];
  const toneBank = [
    ['confident', 'direct', 'warm', 'no-nonsense'],
    ['playful', 'bold', 'clever', 'fresh'],
    ['premium', 'calm', 'assured', 'minimal'],
  ];
  const price = product.price ? `$${product.price}` : 'a fair price';
  return {
    positioning: `${product.name} is the ${product.category} that ${firstClause(product.description)} — without the usual tradeoffs.`,
    value_props: [
      `Solves ${lower(product.category)} without the learning curve`,
      `Works out of the box at ${price}`,
      firstClause(product.description),
      'Backed by people who actually use it daily',
    ],
    audiences: [
      { name: 'Pragmatic switchers', who: `current ${lower(product.category)} users who are frustrated`, pain: pick(painBank, seed), trigger: 'a bad experience with their current option' },
      { name: 'First-time buyers', who: `people new to ${lower(product.category)}`, pain: 'overwhelmed by choice and jargon', trigger: 'a recommendation from someone they trust' },
      { name: 'Value maximizers', who: 'price-aware buyers who still want quality', pain: 'paying premium prices for mediocre results', trigger: 'seeing a clear before/after' },
    ],
    angles: [
      { name: 'Problem/agitate', big_idea: `Name the daily frustration ${lower(product.category)} causes`, hook: `Still ${pick(painBank, seed + 1)}?`, proof: 'testimonial + quick demo' },
      { name: 'Us vs them', big_idea: `Direct comparison against ${(product.competitors || ['the old way'])[0]}`, hook: `We tried ${(product.competitors || ['the alternatives'])[0]} so you don't have to`, proof: 'side-by-side table' },
      { name: 'Founder story', big_idea: 'Why we built this', hook: `We got tired of ${lower(product.category)} that just... didn't`, proof: 'founder to camera' },
      { name: 'Social proof stack', big_idea: 'Let customers sell it', hook: `${1000 + (seed % 9000)}+ people switched last month`, proof: 'review montage' },
    ],
    competitor_notes: (product.competitors || ['Incumbent']).map((c, i) => ({
      name: c,
      weakness_to_exploit: pick(['clunky onboarding', 'hidden fees', 'slow support', 'dated experience'], seed + i),
    })),
    tone: pick(toneBank, seed),
  };
}

export async function research(product) {
  if (config.llm.mode === 'real') {
    return callClaudeJSON(SYSTEM, userPrompt(product), { maxTokens: 2000 });
  }
  return mockBrief(product);
}

const lower = (s = '') => s.toLowerCase();
const firstClause = (s = '') => (s.split(/[.,;]/)[0] || s).trim().toLowerCase();

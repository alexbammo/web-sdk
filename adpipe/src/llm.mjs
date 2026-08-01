import { config } from './config.mjs';

/**
 * Calls Claude (Anthropic Messages API) and returns parsed JSON.
 * Only used when ANTHROPIC_API_KEY is set; otherwise stages fall back to
 * their own deterministic mock generators so the pipeline runs offline.
 */
export async function callClaudeJSON(system, user, { maxTokens = 2000 } = {}) {
  const res = await fetch(`${config.llm.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.llm.key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.llm.model,
      max_tokens: maxTokens,
      system: `${system}\n\nRespond with ONLY valid JSON. No prose, no markdown fences.`,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  return parseLooseJSON(text);
}

/** Tolerates stray fences / leading prose around a JSON object or array. */
export function parseLooseJSON(text) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start !== -1 && end !== -1) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('Could not parse JSON from model output');
  }
}

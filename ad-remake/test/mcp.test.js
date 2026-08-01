import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const serverPath = fileURLToPath(new URL('../src/mcp-server.js', import.meta.url));

/**
 * Drive the MCP server over stdio: send requests, resolve responses by id.
 */
function startClient() {
  const child = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let buf = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  let nextId = 1;
  function rpc(method, params) {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  return { child, rpc, notify, stop: () => child.kill() };
}

test('MCP server: initialize, list tools, and remake an ad', async () => {
  const c = startClient();
  try {
    const init = await c.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    assert.equal(init.result.serverInfo.name, 'ad-remake');
    c.notify('notifications/initialized', {});

    const list = await c.rpc('tools/list', {});
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['analyze_reference', 'plan_remake', 'remake_ad', 'render_remake']);

    const call = await c.rpc('tools/call', {
      name: 'remake_ad',
      arguments: {
        reference: { subject: 'the product', tone: 'energetic' },
        brief: { product: 'NightOwl Lamp', vibe: 'moody', cta: 'Light it up' },
      },
    });
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.plan.meta.product, 'NightOwl Lamp');
    assert.match(payload.result.videoUrl, /final\.mp4$/);
    assert.match(payload.plan.shots.at(-1).prompt, /Light it up/);
  } finally {
    c.stop();
  }
});

test('MCP server: unknown method returns a JSON-RPC error', async () => {
  const c = startClient();
  try {
    const res = await c.rpc('does/not/exist', {});
    assert.ok(res.error);
    assert.equal(res.error.code, -32601);
  } finally {
    c.stop();
  }
});

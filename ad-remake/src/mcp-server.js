#!/usr/bin/env node
// Minimal MCP server (stdio, JSON-RPC 2.0) exposing the ad-remake workflow.
//
// Dependency-free on purpose: implements just enough of the Model Context
// Protocol (initialize / tools/list / tools/call) to be driven by an MCP
// client such as Claude. This is the "MCP connected straight into Claude"
// piece from the post — Claude calls these tools; the provider does the work.
//
// Tools:
//   analyze_reference  { reference }              -> reference structure
//   plan_remake        { reference, brief }       -> render plan
//   render_remake      { plan }                   -> finished video (polls internally)
//   remake_ad          { reference, brief }       -> one-shot: plan + render

import { analyzeReference, planRemake, renderRemake, remakeAd } from './remake.js';
import { getProvider } from './provider.js';

const provider = getProvider();

const TOOLS = [
  {
    name: 'analyze_reference',
    description:
      'Analyze a reference ad into a reusable structure (hook, tone, pacing, shot list).',
    inputSchema: {
      type: 'object',
      properties: {
        reference: {
          type: 'object',
          description:
            'Reference ad descriptor. Either structured ({hook,tone,shots:[...]}) or a light descriptor ({subject/description,tone,pacing}).',
        },
      },
      required: ['reference'],
    },
  },
  {
    name: 'plan_remake',
    description: 'Map a reference structure onto a new product/brief and return a shot-by-shot render plan.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'object' },
        brief: {
          type: 'object',
          description: 'New ad brief: { product, vibe?, audience?, cta?, references? }',
        },
      },
      required: ['reference', 'brief'],
    },
  },
  {
    name: 'render_remake',
    description: 'Submit a render plan to the video provider and poll until the finished video is ready.',
    inputSchema: {
      type: 'object',
      properties: { plan: { type: 'object' } },
      required: ['plan'],
    },
  },
  {
    name: 'remake_ad',
    description:
      'One-shot: analyze a reference, plan a remake for a new product, render, and return the finished video.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'object' },
        brief: { type: 'object' },
      },
      required: ['reference', 'brief'],
    },
  },
];

async function callTool(name, args) {
  switch (name) {
    case 'analyze_reference':
      return analyzeReference(args.reference);
    case 'plan_remake':
      return planRemake(analyzeReference(args.reference), args.brief);
    case 'render_remake':
      return renderRemake(args.plan, provider);
    case 'remake_ad':
      return remakeAd({ reference: args.reference, brief: args.brief, provider });
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

// ---- JSON-RPC plumbing over stdio (newline-delimited JSON) --------------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;
  try {
    switch (method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'ad-remake', version: '0.1.0' },
        });
      case 'notifications/initialized':
        return; // notification, no response
      case 'tools/list':
        return reply(id, { tools: TOOLS });
      case 'tools/call': {
        const out = await callTool(params.name, params.arguments ?? {});
        return reply(id, {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
        });
      }
      case 'ping':
        return reply(id, {});
      default:
        if (id !== undefined) replyError(id, -32601, `method not found: ${method}`);
    }
  } catch (err) {
    if (id !== undefined) replyError(id, -32603, err.message);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (line) handle(JSON.parse(line));
  }
});

// Announce on stderr so it doesn't corrupt the stdout JSON-RPC stream.
process.stderr.write('[ad-remake] MCP server ready on stdio\n');

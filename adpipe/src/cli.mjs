#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { runPipeline } from './pipeline.mjs';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

const HELP = `adpipe — Claude-driven ad creative pipeline

Usage:
  node src/cli.mjs run <product.json> [options]

Options:
  --out <dir>       output directory (default: out/<slug>)
  --budget <n>      daily budget per ad set in USD (default: 30)
  --only <stages>   comma list: research,static,video,publish
  --help

Modes flip real/mock automatically from env:
  ANTHROPIC_API_KEY   -> real research + prompt writing (else deterministic mock)
  OPENAI_API_KEY      -> real image generation (else SVG placeholders)
  SEEDANCE_API_KEY    -> real video jobs (else storyboard JSON)
  META_ACCESS_TOKEN + META_AD_ACCOUNT_ID -> real Meta publish
    (still dry-run unless ADPIPE_META_LIVE=1)`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._[0] !== 'run' || !args._[1]) {
    console.log(HELP);
    process.exit(args.help ? 0 : 1);
  }
  const product = JSON.parse(await readFile(args._[1], 'utf8'));
  const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  const summary = await runPipeline(product, {
    outDir: args.out || `out/${slug}`,
    dailyBudget: Number(args.budget) || 30,
    date,
    only: args.only ? String(args.only).split(',').map((s) => s.trim()) : null,
  });
  console.log('\n' + JSON.stringify(summary.counts, null, 2));
}

main().catch((e) => { console.error('\n✗ ' + e.message); process.exit(1); });

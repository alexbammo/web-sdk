import { config } from '../config.mjs';
import { writeOut, slug, log } from '../util.mjs';

/**
 * Assembles a Meta Ads structure (campaign -> ad set -> ads) from the generated
 * creatives. In mock/dry-run it validates and writes the payload without
 * spending; with a real token + ADPIPE_META_LIVE=1 it would POST to the Graph API.
 */
function buildCampaign(product, brief, creatives, opts) {
  const name = product.name;
  const campaign = {
    name: `${name} — adpipe ${opts.date}`,
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: [],
  };
  const adsets = brief.audiences.map((aud, i) => ({
    name: `AS${i + 1} · ${aud.name}`,
    daily_budget_cents: opts.dailyBudget * 100,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    targeting_note: `${aud.who}; pain: ${aud.pain}; trigger: ${aud.trigger}`,
    status: 'PAUSED',
  }));
  // Round-robin creatives across ad sets so each audience gets a mix.
  const ads = creatives.map((c, i) => ({
    name: `AD${i + 1} · ${c.type} · ${slug((c.spec?.angle || c.script?.angle) ?? 'creative')}`,
    adset: adsets[i % adsets.length].name,
    creative: {
      type: c.type,
      file: c.file,
      primary_text: c.type === 'image' ? c.spec.copy_overlay.subhead : c.script.beats[0].vo,
      headline: c.type === 'image' ? c.spec.copy_overlay.headline : c.script.angle,
      cta: c.type === 'image' ? c.spec.copy_overlay.cta : 'Try it',
    },
    status: 'PAUSED',
  }));
  return { campaign, adsets, ads };
}

function validate(plan) {
  const problems = [];
  if (!plan.campaign.objective) problems.push('campaign.objective missing');
  for (const as of plan.adsets) if (as.daily_budget_cents < 100) problems.push(`${as.name}: budget < $1`);
  for (const ad of plan.ads) if (!ad.creative.file) problems.push(`${ad.name}: no creative file`);
  return problems;
}

async function realPublish(plan) {
  const base = `https://graph.facebook.com/v21.0/act_${config.meta.adAccountId}`;
  const post = async (path, body) => {
    const res = await fetch(`${base}/${path}?access_token=${config.meta.token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Meta ${path} ${res.status}: ${await res.text()}`);
    return res.json();
  };
  const camp = await post('campaigns', plan.campaign);
  log('ok', `created campaign ${camp.id}`);
  // Ad sets + ads would follow here, wired to camp.id.
  return { campaignId: camp.id, live: true };
}

export async function publish(product, brief, creatives, outDir, opts) {
  const plan = buildCampaign(product, brief, creatives, opts);
  const problems = validate(plan);
  await writeOut(`${outDir}/publish/meta-campaign.json`, plan);
  await writeOut(`${outDir}/publish/plan.md`, renderPlanMd(plan, problems));

  if (problems.length) {
    problems.forEach((p) => log('warn', `validation: ${p}`));
  }
  if (config.meta.mode === 'real' && !config.meta.dryRun) {
    if (problems.length) throw new Error('Refusing to publish live with validation errors');
    return realPublish(plan);
  }
  log('info', `DRY-RUN — ${plan.adsets.length} ad sets, ${plan.ads.length} ads assembled (not pushed)`);
  return { dryRun: true, plan, problems };
}

function renderPlanMd(plan, problems) {
  const lines = [`# Meta Ads plan — ${plan.campaign.name}`, ''];
  lines.push(`**Objective:** ${plan.campaign.objective} · **Status:** ${plan.campaign.status}`, '');
  for (const as of plan.adsets) {
    lines.push(`## ${as.name}  ($${as.daily_budget_cents / 100}/day)`);
    lines.push(`- Targeting: ${as.targeting_note}`);
    const ads = plan.ads.filter((a) => a.adset === as.name);
    for (const ad of ads) lines.push(`- **${ad.name}** — "${ad.creative.headline}" / _${ad.creative.primary_text}_ [${ad.creative.cta}]`);
    lines.push('');
  }
  lines.push(problems.length ? `> ⚠ ${problems.length} validation issue(s)` : '> ✓ validation clean');
  return lines.join('\n');
}

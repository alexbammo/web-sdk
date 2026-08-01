import { research } from './stages/research.mjs';
import { staticAds } from './stages/static.mjs';
import { videoAds } from './stages/video.mjs';
import { publish } from './stages/publish.mjs';
import { modeReport } from './config.mjs';
import { writeOut, section, log } from './util.mjs';

export async function runPipeline(product, { outDir, dailyBudget = 30, date = '0000-00-00', only } = {}) {
  const modes = modeReport();
  section(`adpipe · ${product.name}`);
  Object.entries(modes).forEach(([k, v]) => log('info', `${k.padEnd(8)} ${v}`));

  const run = (stage) => !only || only.includes(stage);

  let brief, statics = [], videos = [], pub;

  if (run('research')) {
    section('1/4 Research → brand brief');
    brief = await research(product);
    await writeOut(`${outDir}/brief.json`, brief);
    log('ok', `positioning: ${brief.positioning}`);
    log('ok', `${brief.audiences.length} audiences · ${brief.angles.length} angles`);
  }

  if (run('static')) {
    section('2/4 Static ads');
    statics = await staticAds(brief, outDir);
  }

  if (run('video')) {
    section('3/4 Video ads');
    videos = await videoAds(brief, outDir);
  }

  if (run('publish')) {
    section('4/4 Publish → Meta Ads');
    pub = await publish(product, brief, [...statics, ...videos], outDir, { dailyBudget, date });
  }

  const summary = {
    product: product.name,
    modes,
    counts: { audiences: brief?.audiences.length, angles: brief?.angles.length, static: statics.length, video: videos.length },
    publish: pub?.dryRun ? 'dry-run' : pub?.campaignId ? `live:${pub.campaignId}` : 'skipped',
    outDir,
  };
  await writeOut(`${outDir}/summary.json`, summary);
  section('Done');
  log('ok', `artifacts in ${outDir}`);
  return summary;
}

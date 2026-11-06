import { spawnSync } from 'node:child_process';
const branch = process.env.WORKERS_CI_BRANCH || spawnSync('git',['branch','--show-current'],{encoding:'utf8'}).stdout.trim();
if (branch !== 'dev') { console.error('Este deploy é exclusivo da branch dev.'); process.exit(1); }
for (const args of [
  ['scripts/configure-dev.mjs'],
  ['scripts/wrangler.mjs','d1','migrations','apply','DB','--remote','--config','wrangler.dev.remote.json'],
  ['scripts/wrangler.mjs','deploy','--config','wrangler.dev.remote.json'],
]) {
  const result = spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,CI:'true'}});
  if (result.status !== 0) process.exit(result.status || 1);
}

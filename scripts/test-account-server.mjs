import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
const env = { ...process.env, SAINTS_LOCAL_STATE:'.wrangler/test-state', SAINTS_LOCAL_PORT:'8788' };
const pages = process.argv.includes('--pages');
// Only the disposable test database is reset; development data lives in state/.
rmSync('.wrangler/test-state',{recursive:true,force:true});
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawnSync(npm,['run','build','--','--base=/'],{stdio:'inherit',env});
if (build.status !== 0) process.exit(build.status || 1);
const dbArgs = pages ? ['scripts/wrangler.mjs','d1','execute','DB','--local','--config','wrangler.dev.json','--persist-to','.wrangler/test-state','--file','docs/D1-INICIAL.sql'] : ['scripts/local-site.mjs','db'];
const db = spawnSync(process.execPath,dbArgs,{stdio:'inherit',env});
if (db.status !== 0) process.exit(db.status || 1);
const server = spawn(process.execPath,[pages ? 'scripts/local-pages.mjs' : 'scripts/local-site.mjs','dev'],{stdio:'inherit',env});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.kill(signal));
server.on('exit',code=>process.exit(code ?? 1));

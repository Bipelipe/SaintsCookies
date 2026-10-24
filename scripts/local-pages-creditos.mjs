import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const config = JSON.parse(readFileSync('wrangler.creditos.json','utf8'));
const id = config.d1_databases[0].database_id;
const child = spawn(process.execPath,[
  'scripts/wrangler.mjs','pages','dev','dist','--d1',`DB=${id}`,
  '--persist-to',process.env.CREDITS_LOCAL_STATE || '.wrangler/state',
  '--port',process.env.CREDITS_LOCAL_PORT || '8789','--ip','127.0.0.1',
  '--compatibility-date',config.compatibility_date,
],{stdio:'inherit'});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code ?? 1));

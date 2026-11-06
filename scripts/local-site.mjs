import { spawn } from 'node:child_process';
const action = process.argv[2];
const state = process.env.SAINTS_LOCAL_STATE || '.wrangler/state';
const args = action === 'db'
  ? ['d1','migrations','apply','DB','--local','--config','wrangler.dev.json','--persist-to',state]
  : ['dev','--config','wrangler.dev.json','--ip','127.0.0.1','--port',process.env.SAINTS_LOCAL_PORT || '8787','--persist-to',state];
if (!['db','dev'].includes(action)) { console.error('Ação local inválida.'); process.exit(1); }
const child = spawn(process.execPath,['scripts/wrangler.mjs',...args],{stdio:'inherit'});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code ?? 1));

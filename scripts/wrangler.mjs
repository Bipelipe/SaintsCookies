import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const logs = resolve('.wrangler/logs');
mkdirSync(logs, { recursive: true });
const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, WRANGLER_LOG_PATH: logs, WRANGLER_SEND_METRICS: 'false', XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || resolve('.wrangler/config') },
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));

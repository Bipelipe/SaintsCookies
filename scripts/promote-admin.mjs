import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const email = args[args.indexOf('--email') + 1];
if (!args.includes('--email') || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: npm run site:admin -- --email voce@exemplo.com --local (ou --remote)'); process.exit(1);
}
const remote = args.includes('--remote');
if (remote) {
  const setup = spawnSync(process.execPath, ['scripts/configure-dev.mjs'], { stdio: 'inherit' });
  if (setup.status !== 0) process.exit(setup.status || 1);
}
const safe = email.toLowerCase().replace(/'/g, "''");
const sql = `INSERT INTO account_roles(user_id,role) SELECT id,'admin' FROM users WHERE email='${safe}' ON CONFLICT(user_id) DO UPDATE SET role='admin',updated_at=unixepoch() RETURNING user_id,role;`;
const command = ['scripts/wrangler.mjs','d1','execute','DB','--config',remote ? 'wrangler.dev.remote.json' : 'wrangler.dev.json',remote ? '--remote' : '--local','--command',sql,'--json'];
if (!remote) command.push('--persist-to',process.env.SAINTS_LOCAL_STATE || '.wrangler/state');
const result = spawnSync(process.execPath, command, { encoding:'utf8' });
if (result.status !== 0) { console.error(result.stderr); process.exit(result.status || 1); }
try {
  const rows = JSON.parse(result.stdout);
  if (!rows.some(row => row.results?.length)) throw new Error();
  console.log('Conta cadastrada promovida a administrador. Entre novamente na conta.');
} catch { console.error('Conta não encontrada. Faça o cadastro antes de promover o administrador.'); process.exit(1); }

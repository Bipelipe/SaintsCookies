import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const email = args[args.indexOf('--email') + 1];
if (!args.includes('--email') || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: npm run credits:admin -- --email voce@exemplo.com --local (ou --remote)'); process.exit(1);
}
const remote = args.includes('--remote');
if (remote) {
  const setup = spawnSync(process.execPath, ['scripts/configure-creditos.mjs'], { stdio: 'inherit' });
  if (setup.status !== 0) process.exit(setup.status || 1);
}
const safe = email.toLowerCase().replace(/'/g, "''");
const sql = `UPDATE users SET role='admin' WHERE email='${safe}' RETURNING email,role;`;
const command = ['scripts/wrangler.mjs','d1','execute','DB','--config',remote ? 'wrangler.creditos.remote.json' : 'wrangler.creditos.json',remote ? '--remote' : '--local','--command',sql,'--json'];
if (!remote) command.push('--persist-to',process.env.CREDITS_LOCAL_STATE || '.wrangler/state');
const result = spawnSync(process.execPath, command, { encoding:'utf8' });
if (result.status !== 0) { console.error(result.stderr); process.exit(result.status || 1); }
try {
  const rows = JSON.parse(result.stdout);
  if (!rows.some(row => row.results?.length)) throw new Error();
  console.log('Conta cadastrada promovida a administrador. Entre novamente na conta.');
} catch { console.error('Conta não encontrada. Faça o cadastro antes de promover o administrador.'); process.exit(1); }

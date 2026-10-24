import { readFileSync, writeFileSync } from 'node:fs';
const config = JSON.parse(readFileSync('wrangler.creditos.json', 'utf8'));
const id = process.env.D1_DATABASE_ID || config.d1_databases[0].database_id;
if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) || /^0{8}-/.test(id)) {
  console.error('Defina D1_DATABASE_ID com o Database ID real do banco saintscookies-creditos. Não use o ID local de demonstração.');
  process.exit(1);
}
config.d1_databases[0].database_id = id;
writeFileSync('wrangler.creditos.remote.json', JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
console.log('Configuração do banco remoto preparada para saintscookies-creditos.');

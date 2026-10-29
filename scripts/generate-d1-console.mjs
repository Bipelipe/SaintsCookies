import { readFileSync, writeFileSync } from 'node:fs';
const source = readFileSync('migrations/0001_loyalty.sql','utf8');
const schema = source
  .replace(/^CREATE TABLE /gm,'CREATE TABLE IF NOT EXISTS ')
  .replace(/^CREATE (UNIQUE )?INDEX /gm,(_,unique = '')=>`CREATE ${unique}INDEX IF NOT EXISTS `)
  .replace(/^INSERT INTO rewards /gm,'INSERT OR IGNORE INTO rewards ');
const history = `
-- Keep Wrangler migrations compatible with this initial console import.
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_loyalty.sql');
`;
const checkout = readFileSync('migrations/0002_checkout_whatsapp.sql','utf8');
const checkoutHistory = "\nINSERT OR IGNORE INTO d1_migrations (name) VALUES ('0002_checkout_whatsapp.sql');\n";
writeFileSync('docs/CREDITOS-D1-ATUALIZACAO-0002.sql', '-- Execute no Console do D1 saintscookies-creditos já inicializado.\n-- Atualização aditiva e repetível; preserva contas, compras e pontos.\n-- Cria também o controle de migrações, caso a instalação anterior não o tenha criado.\n\n' + history + checkout + checkoutHistory);
writeFileSync('docs/CREDITOS-D1-INICIAL.sql', '-- Execute no Console do D1 saintscookies-creditos.\n-- Repetir este SQL não apaga clientes, pontos, resgates ou estoque existente.\n\n' + schema + history + checkout + checkoutHistory);
console.log('SQL inicial para o Console D1 preparado.');

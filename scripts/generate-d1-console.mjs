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
writeFileSync('docs/CREDITOS-D1-INICIAL.sql', '-- Execute no Console do D1 saintscookies-creditos.\n-- Repetir este SQL não apaga clientes, pontos, resgates ou estoque existente.\n\n' + schema + history);
console.log('SQL inicial para o Console D1 preparado.');

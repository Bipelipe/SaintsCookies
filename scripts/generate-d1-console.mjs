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
// The dashboard input can flatten pasted newlines. A leading -- comment would
// then swallow the entire script, so keep instructions in the Markdown guide.
const forConsole = sql => sql.split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n').trim() + '\n';
writeFileSync('docs/CREDITOS-D1-ATUALIZACAO-0002.sql', forConsole(history + checkout + checkoutHistory));
writeFileSync('docs/CREDITOS-D1-INICIAL.sql', forConsole(schema + history + checkout + checkoutHistory));
console.log('SQL inicial para o Console D1 preparado.');

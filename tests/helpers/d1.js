import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Real SQLite constraints/transactions behind the small D1 interface used here.
export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('docs/CREDITOS-D1-INICIAL.sql','utf8'));
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values=args;return this; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return {results:sqlite.prepare(sql).all(...values)}; },
        async run() { return {meta:sqlite.prepare(sql).run(...values)}; },
        execute() { sqlite.prepare(sql).run(...values); },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { for(const statement of statements) statement.execute();sqlite.exec('COMMIT');return []; }
      catch(error) { sqlite.exec('ROLLBACK');throw error; }
    },
    exec(sql) { sqlite.exec(sql); },
    close() { sqlite.close(); },
  };
  return db;
}

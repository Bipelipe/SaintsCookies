import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('the console initializer can be repeated without resetting customers, points or stock', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const sql = readFileSync('docs/CREDITOS-D1-INICIAL.sql','utf8');
    db.exec(sql);
    db.exec(`
      INSERT INTO users(id,name,email,password_hash) VALUES ('customer','Cliente de teste','schema@example.test','not-an-authentication-hash');
      INSERT INTO orders(id,user_id,request_key,amount_cents,status,points,sale_reference) VALUES ('order','customer','request',5000,'confirmed',50,'sale-1');
      INSERT INTO point_entries(id,user_id,delta,description,order_id) VALUES ('entry','customer',50,'Compra confirmada','order');
      UPDATE rewards SET stock=7 WHERE id='cookie-classico';
    `);
    db.exec(sql); db.exec(sql);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM users').get().total,1);
    assert.equal(db.prepare('SELECT SUM(delta) AS balance FROM point_entries').get().balance,50);
    assert.equal(db.prepare("SELECT stock FROM rewards WHERE id='cookie-classico'").get().stock,7);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM d1_migrations WHERE name='0001_loyalty.sql'").get().total,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM d1_migrations WHERE name='0002_checkout_whatsapp.sql'").get().total,1);
  } finally { db.close(); }
});

test('incremental checkout migration preserves the original database and is repeatable',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync('migrations/0001_loyalty.sql','utf8'));
    db.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)");
    db.exec("INSERT INTO users(id,name,email,password_hash) VALUES('old','Conta existente','old@example.test','existing-hash')");
    const sql=readFileSync('docs/CREDITOS-D1-ATUALIZACAO-0002.sql','utf8');
    db.exec(sql);db.exec(sql);
    assert.equal(db.prepare("SELECT password_hash FROM users WHERE id='old'").get().password_hash,'existing-hash');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_profiles').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rewards').get().n,3);
  } finally {db.close();}
});

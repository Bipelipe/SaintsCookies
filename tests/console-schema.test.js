import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

for (const incremental of [false,true]) test(`console ${incremental ? 'upgrade' : 'initializer'} still executes when pasted as one line`,()=>{
  const db=new DatabaseSync(':memory:');
  try {
    if (incremental) db.exec(readFileSync('migrations/0001_loyalty.sql','utf8'));
    const filename=incremental ? 'CREDITOS-D1-ATUALIZACAO-0002.sql' : 'CREDITOS-D1-INICIAL.sql';
    const pasted=readFileSync(`docs/${filename}`,'utf8').replace(/[\r\n]+/g,' ');
    db.exec(pasted);db.exec(pasted);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('customer_profiles','checkout_orders','checkout_items','whatsapp_outbox')").get().n,4);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get().n,2);
  } finally {db.close();}
});

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

for (const hasHistory of [false,true]) test(`incremental checkout migration preserves data and is repeatable ${hasHistory ? 'with' : 'without'} an existing migration tracker`,()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync('migrations/0001_loyalty.sql','utf8'));
    if (hasHistory) {
      db.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)");
      db.exec("INSERT INTO d1_migrations(name) VALUES('0001_loyalty.sql')");
    }
    db.exec("INSERT INTO users(id,name,email,password_hash) VALUES('old','Conta existente','old@example.test','existing-hash')");
    const sql=readFileSync('docs/CREDITOS-D1-ATUALIZACAO-0002.sql','utf8');
    db.exec(sql);
    db.exec("INSERT INTO customer_profiles(user_id,phone,address,payment_preference) VALUES('old','5511999999999','Rua dos Testes, 123, São Paulo, SP','pix')");
    db.exec(sql);
    assert.equal(db.prepare("SELECT password_hash FROM users WHERE id='old'").get().password_hash,'existing-hash');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_profiles').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rewards').get().n,3);
    for (const name of ['0001_loyalty.sql','0002_checkout_whatsapp.sql']) {
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM d1_migrations WHERE name=?').get(name).n,1);
    }
  } finally {db.close();}
});

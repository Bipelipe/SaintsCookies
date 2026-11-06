import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, digest, sessionCookie } from '../worker/security.js';
import worker from '../worker/index.js';
import { testDatabase } from './helpers/d1.js';
test('passwords are salted, verifiable, and reject a wrong password', async () => {
  const password = 'this-is-a-test-password';
  const a = await hashPassword(password), b = await hashPassword(password);
  assert.notEqual(a,b);
  assert.ok(!a.includes(password));
  assert.equal(await verifyPassword(password,a),true);
  assert.equal(await verifyPassword('wrong-password',a),false);
  assert.equal(await verifyPassword(password,'invalid'),false);
});
test('sessions use secure HttpOnly cookies and irreversible token digests', async () => {
  const cookie = sessionCookie(new Request('https://test.example/'), 'token');
  for (const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/']) assert.ok(cookie.includes(flag));
  assert.notEqual(await digest('token'),'token');
  assert.equal((await digest('token')).length,64);
});
test('registration enforces password composition and six-character minimum without changing legacy login', async () => {
  const db = testDatabase();
  const person = {name:'Cliente de teste',email:'new@example.test',phone:'(11) 99999-9999',address:'Rua dos Testes, 123, São Paulo, SP',payment_preference:'pix'};
  const post = (path, data) => worker.fetch(new Request(`https://test.example/api/auth/${path}`, {
    method:'POST',headers:{'Content-Type':'application/json',Origin:'https://test.example'},body:JSON.stringify(data),
  }), {DB:db});
  for (const password of ['Abc12','abcdef1','ABCDEF1','Abcdef','Aa1'+'a'.repeat(126),'']) {
    const response = await post('register',{...person,password});
    assert.equal(response.status,400);
    assert.match((await response.json()).error,/maiúscula, uma minúscula e um número/);
  }
  assert.equal((await post('register',{...person,password:'Abc123'})).status,200);
  assert.equal((await post('login',{email:person.email,password:'Abc123'})).status,200);
  const oldPassword = 'existing-lowercase-password';
  await db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)').bind('legacy','Conta antiga','legacy@example.test',await hashPassword(oldPassword)).run();
  assert.equal((await post('login',{email:'legacy@example.test',password:oldPassword})).status,200);
  db.close();
});

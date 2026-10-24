import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, digest, sessionCookie } from '../worker/security.js';
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

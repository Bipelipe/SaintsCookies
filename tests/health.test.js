import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseHealth } from '../worker/health.js';

const binding = first => ({ prepare: () => ({ first }), batch() {}, exec() {} });
test('diagnoses a wrong D1 binding name without exposing environment values', async () => {
  const result = await databaseHealth({
    db: binding(async () => null),
    ASSETS: new Proxy({ fetch() {} }, { get: (target,key) => target[key] || (() => {}) }),
    INTERNAL_TOKEN: 'do-not-expose-this-value',
    CF_PAGES_BRANCH: 'creditos', CF_PAGES_COMMIT_SHA: 'public-commit',
  });
  assert.equal(result.status,503);
  assert.equal(result.data.status,'binding_missing');
  assert.deepEqual(result.data.database_bindings,['db']);
  assert.equal(result.data.deployment.branch,'creditos');
  assert.ok(!JSON.stringify(result).includes('do-not-expose-this-value'));
  assert.ok(!JSON.stringify(result).includes('INTERNAL_TOKEN'));
});
test('distinguishes an empty database from a working one', async () => {
  const empty = await databaseHealth({ DB: binding(async () => { throw new Error('D1_ERROR: no such table: sessions'); }) });
  assert.equal(empty.status,503);
  assert.equal(empty.data.status,'initialization_required');
  const ready = await databaseHealth({ DB: binding(async () => null) });
  assert.equal(ready.status,200);
  assert.equal(ready.data.status,'ok');
});
test('query failures do not expose database errors or sensitive records', async () => {
  const result = await databaseHealth({ DB: binding(async () => { throw new Error('private-database-error-content'); }) });
  assert.equal(result.status,500);
  assert.equal(result.data.status,'query_failed');
  assert.ok(!JSON.stringify(result).includes('private-database-error-content'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from './helpers/d1.js';
import { changeRole,administration } from '../worker/admin.js';
import { effectiveUser,rolesReady,capabilities } from '../worker/roles.js';
import { readFileSync } from 'node:fs';

async function user(db,id,role='customer') {
  await db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').bind(id,`Pessoa ${id}`,`${id}@example.test`,'never-expose-this-hash',role).run();
  return {id,role,name:`Pessoa ${id}`};
}
test('roles migration is additive, repeatable and preserves legacy passwords and roles',async()=>{
  const db=testDatabase();
  try {
    const a=await user(db,'a','admin'),c=await user(db,'c');
    db.exec('DROP TABLE role_changes; DROP TABLE account_roles');
    assert.equal(await rolesReady(db),false);assert.equal((await effectiveUser(db,a)).role,'admin');
    const sql=readFileSync('docs/D1-ATUALIZACAO-0003.sql','utf8').replace(/[\r\n]+/g,' ');
    db.exec(sql);db.exec(sql);
    assert.equal(await rolesReady(db),true);
    assert.equal((await db.prepare('SELECT password_hash FROM users WHERE id=?').bind(c.id).first()).password_hash,'never-expose-this-hash');
    await changeRole(db,a,c.id,{role:'owner',expected_role:'customer'});
    assert.equal((await effectiveUser(db,c)).role,'owner');
    assert.equal((await db.prepare('SELECT role FROM users WHERE id=?').bind(c.id).first()).role,'customer');
    assert.deepEqual(capabilities('owner'),{manage_users:false,manage_orders:true});
    assert.deepEqual(capabilities('customer'),{manage_users:false,manage_orders:false});
  }finally{db.close();}
});
test('role changes require admin, reject stale requests and are recorded atomically',async()=>{
  const db=testDatabase();
  try {
    const a=await user(db,'a','admin'),c=await user(db,'c');
    await assert.rejects(changeRole(db,c,a.id,{role:'customer',expected_role:'admin'}),e=>e.status===403);
    await assert.rejects(changeRole(db,a,c.id,{role:'superadmin',expected_role:'customer'}),e=>e.status===400);
    await changeRole(db,a,c.id,{role:'owner',expected_role:'customer'});
    await assert.rejects(changeRole(db,a,c.id,{role:'admin',expected_role:'customer'}),e=>e.status===409);
    const events=(await db.prepare('SELECT previous_role,new_role,changed_by FROM role_changes').all()).results;
    assert.deepEqual(events.map(e=>({...e})),[{previous_role:'customer',new_role:'owner',changed_by:'a'}]);
    db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON role_changes BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END");
    await assert.rejects(changeRole(db,a,c.id,{role:'admin',expected_role:'owner'}));
    assert.equal((await effectiveUser(db,c)).role,'owner');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM role_changes').first()).n,1);
  }finally{db.close();}
});
test('self-demotion and concurrent cross-demotions cannot remove the last admin',async()=>{
  const db=testDatabase();
  try {
    const a=await user(db,'a','admin'),b=await user(db,'b','admin');
    await assert.rejects(changeRole(db,a,a.id,{role:'customer',expected_role:'admin'}),e=>e.status===409);
    const result=await Promise.allSettled([
      changeRole(db,a,b.id,{role:'customer',expected_role:'admin'}),
      changeRole(db,b,a.id,{role:'customer',expected_role:'admin'}),
    ]);
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    const roles=await Promise.all([effectiveUser(db,a),effectiveUser(db,b)]);
    assert.equal(roles.filter(u=>u.role==='admin').length,1);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM role_changes').first()).n,1);
  }finally{db.close();}
});
test('database summary and directory never expose hashes or sessions and support pagination/search',async()=>{
  const db=testDatabase();
  try {
    const a=await user(db,'a','admin');await user(db,'b');await user(db,'c');
    const read=path=>administration(new Request(`https://example.test/api/admin/${path}`),db,a,()=>{});
    const directory=await read('users?limit=1&page=2');
    assert.equal(directory.total,3);assert.equal(directory.users.length,1);assert.equal(directory.pages,3);
    assert.ok(!JSON.stringify(directory).includes('password_hash'));assert.ok(!JSON.stringify(directory).includes('never-expose-this-hash'));
    assert.equal((await read('users?q=b%40example.test')).total,1);
    assert.equal((await read("users?q=%27%20OR%201%3D1--")).total,0);
    const dashboard=await read('dashboard');
    assert.ok(!JSON.stringify(dashboard).includes('sessions'));assert.equal(dashboard.roles.customer,2);
    await assert.rejects(read('users?limit=51'),e=>e.status===400);
    await assert.rejects(read('users?role=superadmin'),e=>e.status===400);
  }finally{db.close();}
});

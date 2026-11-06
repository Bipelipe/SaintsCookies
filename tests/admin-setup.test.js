import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {testDatabase} from './helpers/d1.js';
import {effectiveUser} from '../worker/roles.js';

function setupSql(email) {
  const directory=mkdtempSync(join(tmpdir(),'saints-admin-setup-'));
  try {
    const output=join(directory,'setup.sql');
    execFileSync(process.execPath,['scripts/prepare-admin-setup.mjs','--email',email,'--output',output]);
    return readFileSync(output,'utf8').replace(/[\r\n]+/g,' ');
  }finally{rmSync(directory,{recursive:true,force:true});}
}
test('personal setup assigns the registered admin, initializes clients and preserves subsequent explicit roles',async()=>{
  const db=testDatabase();
  try {
    db.exec("INSERT INTO users(id,name,email,password_hash) VALUES('me','Admin escolhido','admin@example.test','preserved-hash'); INSERT INTO users(id,name,email,password_hash,role) VALUES('other','Outra conta','other@example.test','other-hash','admin')");
    const sql=setupSql('admin@example.test');db.exec(sql);
    assert.equal((await effectiveUser(db,{id:'me',role:'customer'})).role,'admin');
    assert.equal((await effectiveUser(db,{id:'other',role:'admin'})).role,'customer');
    assert.equal((await db.prepare("SELECT password_hash FROM users WHERE id='me'").first()).password_hash,'preserved-hash');
    db.exec("UPDATE account_roles SET role='owner' WHERE user_id='other'");db.exec(sql);
    assert.equal((await effectiveUser(db,{id:'other',role:'admin'})).role,'owner');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n,2);
  }finally{db.close();}
});
test('setup with an unregistered email never creates a user or auto-promotes a later signup',async()=>{
  const db=testDatabase();
  try {
    db.exec("INSERT INTO users(id,name,email,password_hash,role) VALUES('old','Admin anterior','old@example.test','preserved-hash','admin')");
    const sql=setupSql('missing@example.test');db.exec(sql);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM account_roles').first()).n,0);
    assert.equal((await effectiveUser(db,{id:'old',role:'admin'})).role,'admin');
    db.exec("INSERT INTO users(id,name,email,password_hash) VALUES('new','Novo cadastro','missing@example.test','new-hash')");
    assert.equal((await effectiveUser(db,{id:'new',role:'customer'})).role,'customer');
    db.exec(sql);assert.equal((await effectiveUser(db,{id:'new',role:'customer'})).role,'admin');
  }finally{db.close();}
});

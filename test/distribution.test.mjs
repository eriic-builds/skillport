import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './helpers/sandbox.mjs';

test('standalone install initializes an empty separate library', t => {
  const s=sandbox(t), library=join(s.root,"user's skills");
  const result=s.run('install','--library',library,'--clients','none','--no-shell','--yes');
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(readdirSync(join(library,'skills')),[]);
  assert.deepEqual(readdirSync(join(library,'shelf')),[]);
  assert.equal(existsSync(join(library,'.git')),false);
  assert.equal(existsSync(join(library,'index.html')),false);
  assert.equal(JSON.parse(readFileSync(join(s.home,'.skillport','config.json'))).library,library);
  assert.equal(s.run('new','example','--library',library).status,0);
  assert.ok(existsSync(join(library,'skills','example','SKILL.md')));
  assert.equal(existsSync(join(s.repo,'skills','example')),false);
  const doctor=s.run('doctor','--json','--library',library);
  assert.equal(doctor.status,0,doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).ok,true);
});
test('standalone dry-run does not initialize anything', t => {
  const s=sandbox(t), library=join(s.root,'not-created');
  const result=s.run('install','--library',library,'--clients','none','--no-shell','--dry-run');
  assert.equal(result.status,0,result.stderr);
  assert.equal(existsSync(library),false);
  assert.equal(existsSync(join(s.home,'.skillport')),false);
});
test('standalone sync reports Git requirement without initialization', t => {
  const s=sandbox(t);
  const result=s.run('sync');
  assert.equal(result.status,1);
  assert.match(result.stderr,/Git-backed library/);
  assert.equal(existsSync(join(s.repo,'.git')),false);
});

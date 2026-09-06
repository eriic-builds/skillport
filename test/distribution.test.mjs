import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
  assert.deepEqual(readdirSync(join(library,'skills','example')),['SKILL.md']);
  assert.equal(s.run('new','documented','--use-cases','--library',library).status,0);
  assert.ok(existsSync(join(library,'skills','documented','USE_CASES.html')));
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
test('optional shelf starter is minimal, idempotent and dry-run safe', t=>{
  const s=sandbox(t), library=join(s.root,'starter library');
  const args=['install','--library',library,'--starter','shelf','--clients','none','--no-shell'];
  let result=s.run(...args,'--dry-run');
  assert.equal(result.status,0,result.stderr);
  assert.equal(existsSync(library),false);
  result=s.run(...args,'--yes');
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(readdirSync(join(library,'skills')),['skill-shelf']);
  assert.deepEqual(readdirSync(join(library,'skills','skill-shelf')),['SKILL.md']);
  assert.deepEqual(readdirSync(join(library,'shelf')),[]);
  result=s.run(...args,'--yes');
  assert.equal(result.status,0,result.stderr);
});
test('starter installation preserves existing user skill', t=>{
  const s=sandbox(t), path=s.skill('skill-shelf',false,'Custom user content');
  const before=readFileSync(join(path,'SKILL.md'),'utf8');
  const result=s.run('install','--starter','shelf','--clients','none','--no-shell','--yes');
  assert.equal(result.status,1);
  assert.match(result.stderr,/Refusing to overwrite/);
  assert.equal(readFileSync(join(path,'SKILL.md'),'utf8'),before);
});
test('custom profile location survives later link reconciliation', t=>{
  const s=sandbox(t), profile=join(s.home,"redirected space's",'profile');
  let result=s.run('install','--clients','none','--profile',profile,'--yes');
  assert.equal(result.status,0,result.stderr);
  const config=join(s.repo,'.skillport','local.json');
  assert.equal(JSON.parse(readFileSync(config)).profile,profile);
  result=s.run('link');assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(readFileSync(config)).profile,profile);
});
test('replacement runtime uses saved library without moving or overwriting skills',t=>{
  const s=sandbox(t), library=join(s.root,"user's separate library");
  const installed=s.run('install','--library',library,'--clients','none','--no-shell','--yes');
  assert.equal(installed.status,0,installed.stderr);
  assert.equal(s.run('new','personal','--library',library).status,0);
  const skill=join(library,'skills','personal','SKILL.md'), before=readFileSync(skill,'utf8');
  const replacement=join(s.root,'upgraded runtime');
  cpSync(join(s.repo,'bin'),join(replacement,'bin'),{recursive:true});
  const result=spawnSync(process.execPath,[join(replacement,'bin','skills.mjs'),'list'],{env:s.env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/personal/);
  assert.equal(readFileSync(skill,'utf8'),before);
  assert.equal(existsSync(join(replacement,'skills')),false);
});

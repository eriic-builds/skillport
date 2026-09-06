import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './helpers/sandbox.mjs';
import { clientFixture } from './helpers/client-fixture.mjs';

test('doctor none ignores missing clients and emits parseable JSON', t => {
  const s=sandbox(t); s.skill('example');
  assert.equal(s.run('link','--clients','none').status,0);
  const json=s.run('doctor','--json'), text=s.run('doctor');
  assert.equal(json.status,0,json.stderr);
  assert.equal(text.status,0,text.stderr);
  const result=JSON.parse(json.stdout);
  assert.equal(result.ok,true); assert.deepEqual(result.clients,[]);
});
test('text and JSON reject the same invalid skill', t => {
  const s=sandbox(t); s.skill('example',false,'See `missing.md`.');
  s.run('link','--clients','none');
  const json=s.run('doctor','--json'), text=s.run('doctor');
  assert.equal(json.status,1); assert.equal(text.status,1);
  const state=JSON.parse(json.stdout);
  assert.equal(state.ok,false);
  for(const error of state.errors) assert.ok(text.stderr.includes(error));
});
test('doctor JSON fails missing selected per-skill links', t => {
  const s=sandbox(t); s.skill('example');
  const result=s.run('doctor','--json','--clients','codex');
  assert.equal(result.status,1);
  const state=JSON.parse(result.stdout);
  assert.ok(state.errors.some(error=>error.includes('missing') && error.includes('.agents')));
});
test('doctor reports dangling orphan links', t => {
  const s=sandbox(t);
  const root=join(s.home,'.agents','skills'); mkdirSync(root,{recursive:true});
  symlinkSync(join(s.repo,'skills','gone'),join(root,'gone'),process.platform==='win32'?'junction':'dir');
  const result=s.run('doctor','--json','--clients','codex');
  assert.equal(result.status,1);
  assert.ok(JSON.parse(result.stdout).errors.some(error=>error.includes('left over')));
});
test('doctor recognizes saved redirected UTF-16 profile and escaped library allowance',t=>{
  const s=sandbox(t), skill=s.skill('example',false,'Read `notes.md`.');
  writeFileSync(join(skill,'notes.md'),'Supporting content');
  clientFixture(s,'copilot',"console.log('example');");
  const profile=join(s.home,"OneDrive space's",'profile');mkdirSync(join(profile,'..'),{recursive:true});
  writeFileSync(profile,'\ufeff# Personal profile\r\n','utf16le');
  const install=s.run('install','--clients','copilot','--profile',profile,'--yes');
  assert.equal(install.status,0,install.stderr);
  assert.equal(s.run('link').status,0);
  const result=s.run('doctor','--json');
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.equal(JSON.parse(result.stdout).ok,true);
});
test('broken selected client fails both doctor formats',t=>{
  const s=sandbox(t);s.skill('example');
  clientFixture(s,'codex',"console.error('fixture client broken');process.exit(7);");
  const linked=s.run('link','--clients','codex');assert.equal(linked.status,0,linked.stderr);
  for(const args of [['doctor'],['doctor','--json']]) {
    const result=s.run(...args);assert.equal(result.status,1);
    if(args.includes('--json')) assert.ok(JSON.parse(result.stdout).errors.some(error=>error.includes('fixture client broken')));
    else assert.match(result.stderr,/fixture client broken/);
  }
});

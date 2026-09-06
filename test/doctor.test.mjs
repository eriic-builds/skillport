import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './helpers/sandbox.mjs';

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

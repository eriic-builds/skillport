import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './helpers/sandbox.mjs';

test('none persists without creating client folders', t => {
  const s=sandbox(t); s.skill('example');
  const result=s.run('link','--clients','none');
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(readdirSync(s.home),[]);
  assert.deepEqual(JSON.parse(readFileSync(join(s.repo,'.skillport','local.json'))),{clients:[]});
  assert.equal(s.run('link').status,0);
  assert.deepEqual(readdirSync(s.home),[]);
});
test('codex selection only wires its skill roots', t => {
  const s=sandbox(t); s.skill('example');
  const result=s.run('link','--clients','codex');
  assert.equal(result.status,0,result.stderr);
  assert.ok(existsSync(join(s.home,'.agents','skills','example','SKILL.md')));
  assert.deepEqual(readdirSync(s.home).sort(),['.agents','.codex']);
});
test('dry run writes neither links nor local config', t => {
  const s=sandbox(t); s.skill('example');
  assert.equal(s.run('link','--clients','codex','--dry-run').status,0);
  assert.deepEqual(readdirSync(s.home),[]);
  assert.equal(existsSync(join(s.repo,'.skillport')),false);
});
test('later destination conflict prevents all earlier links', t => {
  const s=sandbox(t); s.skill('example');
  mkdirSync(join(s.home,'.agents','skills','example'),{recursive:true});
  const result=s.run('link','--clients','claude,codex');
  assert.equal(result.status,1);
  assert.match(result.stderr,/conflicts/);
  assert.equal(existsSync(join(s.home,'.claude')),false);
  assert.equal(existsSync(join(s.home,'.codex')),false);
});
test('unknown client fails before changes', t => {
  const s=sandbox(t); s.skill('example');
  assert.equal(s.run('link','--clients','claudde').status,1);
  assert.deepEqual(readdirSync(s.home),[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './helpers/sandbox.mjs';

test('CLI shelve removes both owned links and deduplicates arguments', t => {
  const s=sandbox(t), source=s.skill('example');
  const links=['.codex','.agents'].map(client=>join(s.home,client,'skills','example'));
  for(const link of links) {
    mkdirSync(join(link,'..'),{recursive:true});
    symlinkSync(source,link,process.platform==='win32'?'junction':'dir');
  }
  const result=s.run('shelve','example','example');
  assert.equal(result.status,0,result.stderr);
  assert.ok(existsSync(join(s.repo,'shelf','example','SKILL.md')));
  for(const link of links) assert.throws(()=>lstatSync(link),{code:'ENOENT'});
});

test('CLI unshelve validates the whole batch before moving its first item', t => {
  const s=sandbox(t);
  s.skill('valid',true); s.skill('invalid',true,'See `missing.md`.');
  const result=s.run('unshelve','valid','invalid');
  assert.equal(result.status,1);
  assert.match(result.stderr,/missing/i);
  assert.ok(existsSync(join(s.repo,'shelf','valid')));
  assert.equal(existsSync(join(s.repo,'skills','valid')),false);
});

test('CLI shelve refuses an existing non-skill destination', t => {
  const s=sandbox(t); s.skill('example');
  mkdirSync(join(s.repo,'shelf','example'));
  assert.equal(s.run('shelve','example').status,1);
  assert.ok(existsSync(join(s.repo,'skills','example','SKILL.md')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './helpers/sandbox.mjs';
import { clientFixture } from './helpers/client-fixture.mjs';

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
test('failed activation registration restores skills and removes newly created root links', t=>{
  const s=sandbox(t), source=s.skill('example',true,'Original bytes');
  const before=readFileSync(join(source,'SKILL.md'),'utf8');
  clientFixture(s,'copilot',"console.error('fixture registration failure');process.exit(1);");
  mkdirSync(join(s.repo,'.skillport'));
  const config=join(s.repo,'.skillport','local.json');
  const configBytes=JSON.stringify({clients:['claude','codex','copilot']});writeFileSync(config,configBytes);
  const result=s.run('unshelve','example');
  assert.equal(result.status,1);assert.match(result.stderr,/fixture registration failure/);
  assert.equal(readFileSync(join(source,'SKILL.md'),'utf8'),before);
  assert.equal(existsSync(join(s.repo,'skills','example')),false);
  for(const path of [join(s.home,'.claude','skills'),join(s.home,'.codex','skills','example'),join(s.home,'.agents','skills','example')]) {
    assert.throws(()=>lstatSync(path),{code:'ENOENT'});
  }
  assert.equal(readFileSync(config,'utf8'),configBytes);
});
test('shelf round trips preserve system, foreign and independent project content', t=>{
  const s=sandbox(t), source=s.skill('example',false,'Original bytes');
  const before=readFileSync(join(source,'SKILL.md'),'utf8');
  const system=join(s.home,'.codex','skills','.system');mkdirSync(system,{recursive:true});
  writeFileSync(join(system,'keep.txt'),'System bytes');
  const foreign=join(s.home,'.agents','skills','personal');mkdirSync(foreign,{recursive:true});
  writeFileSync(join(foreign,'keep.txt'),'Personal bytes');
  const project=join(s.repo,'project','.agents','skills','example');mkdirSync(project,{recursive:true});
  writeFileSync(join(project,'SKILL.md'),before);
  let result=s.run('link','--clients','codex');assert.equal(result.status,0,result.stderr);
  for(let i=0;i<2;i++) {
    result=s.run('shelve','example');assert.equal(result.status,0,result.stderr);
    assert.equal(s.run('doctor','--json').status,0);
    result=s.run('unshelve','example');assert.equal(result.status,0,result.stderr);
    assert.equal(readFileSync(join(source,'SKILL.md'),'utf8'),before);
  }
  assert.equal(readFileSync(join(system,'keep.txt'),'utf8'),'System bytes');
  assert.equal(readFileSync(join(foreign,'keep.txt'),'utf8'),'Personal bytes');
  assert.equal(readFileSync(join(project,'SKILL.md'),'utf8'),before);
});
test('case-folded shelf destinations are conflicts on every filesystem',t=>{
  for(const command of ['shelve','unshelve']) {
    const s=sandbox(t);s.skill('example',command==='unshelve');
    const target=join(s.repo,command==='unshelve'?'skills':'shelf','EXAMPLE');mkdirSync(target);
    writeFileSync(join(target,'personal.txt'),'Keep me');
    const result=s.run(command,'example');assert.equal(result.status,1);
    assert.equal(readFileSync(join(target,'personal.txt'),'utf8'),'Keep me');
    assert.ok(existsSync(join(s.repo,command==='unshelve'?'shelf':'skills','example','SKILL.md')));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, lstatSync, renameSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sandbox } from './helpers/sandbox.mjs';

test('sync reconciles remotely shelved and added skills', t=>{
  const s=sandbox(t);
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,env:s.env,stdio:'pipe'});
  s.env.GIT_AUTHOR_NAME=s.env.GIT_COMMITTER_NAME='Fixture';
  s.env.GIT_AUTHOR_EMAIL=s.env.GIT_COMMITTER_EMAIL='fixture@example.test';
  s.skill('old');
  s.skill('deleted');
  writeFileSync(join(s.repo,'.gitignore'),'.skillport/\n');
  git(s.repo,'init','-b','main');git(s.repo,'add','.');git(s.repo,'commit','-m','initial');
  const remote=join(s.root,'remote.git');git(s.root,'init','--bare',remote);
  git(s.repo,'remote','add','origin',remote);git(s.repo,'push','-u','origin','main');
  assert.equal(s.run('link','--clients','codex').status,0);
  const other=join(s.root,'other');git(s.root,'clone','-b','main',remote,other);
  mkdirSync(join(other,'shelf'),{recursive:true});
  renameSync(join(other,'skills','old'),join(other,'shelf','old'));
  rmSync(join(other,'skills','deleted'),{recursive:true});
  mkdirSync(join(other,'skills','added'));
  writeFileSync(join(other,'skills','added','SKILL.md'),'---\nname: added\ndescription: Added fixture\n---\n');
  git(other,'add','.');git(other,'commit','-m','change active selection');git(other,'push');
  const result=s.run('sync');assert.equal(result.status,0,result.stderr);
  for(const client of ['.codex','.agents']) {
    assert.throws(()=>lstatSync(join(s.home,client,'skills','old')),{code:'ENOENT'});
    assert.throws(()=>lstatSync(join(s.home,client,'skills','deleted')),{code:'ENOENT'});
    assert.ok(existsSync(join(s.home,client,'skills','added','SKILL.md')));
  }
  appendFileSync(join(s.repo,'skills','added','SKILL.md'),'\nLocal update\n');
  const push=s.run('sync','Update standalone Git library');assert.equal(push.status,0,push.stderr);
  assert.equal(existsSync(join(s.repo,'.claude-plugin')),false);
  assert.equal(s.run('doctor','--json').status,0);
});

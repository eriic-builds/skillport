import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, lstatSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sandbox } from './helpers/sandbox.mjs';

test('sync reconciles remotely shelved and added skills', t=>{
  const s=sandbox(t);
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,env:s.env,stdio:'pipe'});
  s.env.GIT_AUTHOR_NAME=s.env.GIT_COMMITTER_NAME='Fixture';
  s.env.GIT_AUTHOR_EMAIL=s.env.GIT_COMMITTER_EMAIL='fixture@example.test';
  s.skill('old');
  writeFileSync(join(s.repo,'.gitignore'),'.skillport/\n');
  git(s.repo,'init','-b','main');git(s.repo,'add','.');git(s.repo,'commit','-m','initial');
  const remote=join(s.root,'remote.git');git(s.root,'init','--bare',remote);
  git(s.repo,'remote','add','origin',remote);git(s.repo,'push','-u','origin','main');
  assert.equal(s.run('link','--clients','codex').status,0);
  const other=join(s.root,'other');git(s.root,'clone','-b','main',remote,other);
  mkdirSync(join(other,'shelf'),{recursive:true});
  renameSync(join(other,'skills','old'),join(other,'shelf','old'));
  mkdirSync(join(other,'skills','added'));
  writeFileSync(join(other,'skills','added','SKILL.md'),'---\nname: added\ndescription: Added fixture\n---\n');
  git(other,'add','.');git(other,'commit','-m','change active selection');git(other,'push');
  const result=s.run('sync');assert.equal(result.status,0,result.stderr);
  for(const client of ['.codex','.agents']) {
    assert.throws(()=>lstatSync(join(s.home,client,'skills','old')),{code:'ENOENT'});
    assert.ok(existsSync(join(s.home,client,'skills','added','SKILL.md')));
  }
});

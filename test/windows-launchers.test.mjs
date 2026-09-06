import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sandbox } from './helpers/sandbox.mjs';
import { powershellQuote } from '../bin/profile.mjs';

test('native Windows launchers preserve library paths and failure exit codes', {skip:process.platform!=='win32'}, t=>{
  const s=sandbox(t);s.skill('example');
  for(const shell of ['pwsh','powershell.exe']) for(const extension of ['cmd','ps1']) {
    const launcher=join(s.repo,'bin','skills.'+extension);
    const invoke=args=>spawnSync(shell,['-NoProfile','-NonInteractive','-Command',
      `& ${powershellQuote(launcher)} ${args}; exit $LASTEXITCODE`],{env:s.env,encoding:'utf8',timeout:15000});
    const good=invoke(`--library ${powershellQuote(s.repo)} list`);
    assert.equal(good.status,0,good.stderr);
    assert.match(good.stdout,/example/);
    const bad=invoke('not-a-command');
    assert.equal(bad.status,1,bad.stderr);
  }
});

test('native PowerShell executes generated profile function with quoted paths', {skip:process.platform!=='win32'}, t=>{
  const s=sandbox(t);s.skill('example');
  const profile=join(s.home,"OneDrive space's",'profile.ps1');
  const setup=s.run('install','--clients','none','--profile',profile,'--yes');
  assert.equal(setup.status,0,setup.stderr);
  for(const shell of ['pwsh','powershell.exe']) {
  const result=spawnSync(shell,['-NoProfile','-NonInteractive','-Command',
    `. ${powershellQuote(profile)}; skills list; exit $LASTEXITCODE`],{env:s.env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/example/);
  }
});

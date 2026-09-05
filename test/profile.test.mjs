import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { profileTarget, updateProfile, shellQuote, powershellQuote } from '../bin/profile.mjs';

test('profile follows invoking shell and redirected locations', () => {
  assert.equal(profileTarget({home:'/home/test',windows:false,env:{SHELL:'/bin/zsh',ZDOTDIR:'/custom'}}), join('/custom','.zshrc'));
  assert.equal(profileTarget({home:'C:/test',windows:true,env:{SKILLPORT_POWERSHELL_PROFILE:'C:/OneDrive/profile.ps1'}}),'C:/OneDrive/profile.ps1');
  assert.equal(profileTarget({home:'C:/test',windows:true,env:{}}),null);
});
test('managed profile preserves content, encoding and idempotence', t => {
  const dir=mkdtempSync(join(tmpdir(),'skillport-profile-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'profile'); const original='\ufeff# custom\r\n'; writeFileSync(path,original,'utf16le');
  assert.equal(updateProfile(path,['function skills {}'],true),true);
  assert.equal(readFileSync(path,'utf16le'),original);
  updateProfile(path,['function skills {}']);
  assert.equal(updateProfile(path,['function skills {}']),false);
  updateProfile(path,['function skills { new-command }']);
  const result=readFileSync(path,'utf16le');
  assert.ok(result.startsWith(original)); assert.equal(result.split('>>>').length,3);
  assert.equal(readFileSync(path+'.skills-backup','utf16le'),original);
});
test('quotes preserve literal shell characters', () => {
  const value="a b'c$d";
  assert.equal(powershellQuote(value),"'a b''c$d'");
  if(process.platform !== 'win32') {
    const result=spawnSync('/bin/sh',['-c',`printf %s ${shellQuote(value)}`],{encoding:'utf8'});
    assert.equal(result.stdout,value); assert.equal(result.status,0);
  }
});

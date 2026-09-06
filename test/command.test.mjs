import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execute, npmShimTarget } from '../bin/command.mjs';
import { sandbox } from './helpers/sandbox.mjs';

test('native execution preserves literal argument boundaries',()=>{
  const args=['spaces here',"apostrophe's",'$x','&echo injected','%PATH%'];
  const result=execute(process.execPath,['-e','console.log(JSON.stringify(process.argv.slice(1)))','--',...args]);
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),args);
});
test('missing executable and timeout remain distinguishable',()=>{
  assert.equal(execute('skillport-no-such-command-123',[]).error.code,'ENOENT');
  const result=execute(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:50});
  assert.equal(result.error.code,'ETIMEDOUT');
});
test('npm Windows shim resolves to its Node entrypoint',t=>{
  const s=sandbox(t), directory=join(s.root,'npm bin');mkdirSync(directory);
  const script=join(directory,'cli.js'), shim=join(directory,'copilot.cmd');
  writeFileSync(script,'console.log(JSON.stringify(process.argv.slice(2)))');
  writeFileSync(shim,'@echo off\r\n"%dp0%\\node.exe" "%dp0%\\cli.js" %*\r\n');
  assert.equal(npmShimTarget(shim),script);
  if(process.platform==='win32') {
    const result=execute(shim,['a & b',"c'd",'$e']);
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),['a & b',"c'd",'$e']);
  }
});

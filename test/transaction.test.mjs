import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './helpers/sandbox.mjs';
import { moveBatch } from '../bin/transaction.mjs';

test('failed second move restores earlier skill',t=>{
  const s=sandbox(t);const a=s.skill('alpha'),b=s.skill('beta');
  const destA=join(s.repo,'shelf','alpha'),destB=join(s.repo,'shelf','beta');
  let calls=0;
  assert.throws(()=>moveBatch([[a,destA],[b,destB]],()=>{},()=>{},(from,to)=>{
    if(++calls===2) throw new Error('injected disk error');renameSync(from,to);
  }),/injected disk error/);
  assert.ok(existsSync(a));assert.ok(existsSync(b));assert.equal(existsSync(destA),false);
});
test('post-move effect failure restores skill and invokes cleanup',t=>{
  const s=sandbox(t);const a=s.skill('alpha'),target=join(s.repo,'shelf','alpha');let cleaned=false;
  assert.throws(()=>moveBatch([[a,target]],()=>{throw new Error('registration failed');},()=>{cleaned=true;}),/registration failed/);
  assert.ok(existsSync(a));assert.equal(existsSync(target),false);assert.equal(cleaned,true);
});

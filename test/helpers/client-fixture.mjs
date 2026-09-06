import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join, delimiter } from 'node:path';

export function clientFixture(s,name,body) {
  const directory=join(s.root,'client shims');mkdirSync(directory,{recursive:true});
  const script=join(directory,name+'.mjs');
  writeFileSync(script,'#!/usr/bin/env node\n'+body+'\n');chmodSync(script,0o755);
  if(process.platform==='win32') {
    writeFileSync(join(directory,name+'.cmd'),`@echo off\r\nnode "%~dp0\\${name}.mjs" %*\r\n`);
  } else {
    writeFileSync(join(directory,name),'#!/usr/bin/env node\n'+body+'\n');
    chmodSync(join(directory,name),0o755);
  }
  const key=Object.keys(s.env).find(key=>key.toLowerCase()==='path') || 'PATH';
  s.env[key]=directory+delimiter+(s.env[key] || '');
}

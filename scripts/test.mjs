import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files=readdirSync('test').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'test/'+name);
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(result.error) console.error(result.error.message);
process.exitCode=result.status ?? 1;

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Build-host verification only: tar, unzip and npm are not runtime dependencies.
const repo=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.argv[2] || join(repo,'dist-runtime'));
const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));
const allowed=path=>/^(LICENSE|package\.json|bin\/(skills|skills\.(cmd|ps1)|[a-z-]+\.mjs|templates\/skill-shelf\/SKILL\.md))$/.test(path);
const temporary=mkdtempSync(join(tmpdir(),'skillport-verify-'));
try {
  for(const archive of manifest.archives) {
    const bytes=readFileSync(join(output,archive.name));
    assert.equal(bytes.length,archive.bytes);
    assert.ok(bytes.length<=250000);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),archive.sha256);
    const extract=join(temporary,archive.name);mkdirSync(extract);
    if(archive.name.endsWith('.zip')) execFileSync('unzip',['-q',join(output,archive.name),'-d',extract]);
    else execFileSync('tar',['-xzf',join(output,archive.name),'-C',extract]);
    const files=[];
    const walk=dir=>{
      for(const entry of readdirSync(dir,{withFileTypes:true})) {
        const path=join(dir,entry.name);
        assert.equal(entry.isSymbolicLink(),false,'No archive symlinks');
        if(entry.isDirectory()) walk(path);else files.push(relative(extract,path));
      }
    };
    walk(extract);
    assert.deepEqual(files.sort(),[...manifest.files].sort());
    for(const file of files) assert.ok(file.startsWith('skillport/') && allowed(file.slice(10)),file);
    const home=join(extract,'isolated home');mkdirSync(home);
    const library=join(home,"user's library");
    const cli=join(extract,'skillport','bin','skills.mjs');
    const run=(...args)=>execFileSync(process.execPath,[cli,...args],{
      cwd:extract,env:{...process.env,HOME:home,USERPROFILE:home},encoding:'utf8',timeout:15000,
    });
    run('install','--library',library,'--clients','none','--no-shell','--yes');
    assert.deepEqual(readdirSync(join(library,'skills')),[]);
    assert.deepEqual(readdirSync(join(library,'shelf')),[]);
    run('install','--library',library,'--clients','none','--no-shell','--starter','shelf','--yes');
    assert.deepEqual(readdirSync(join(library,'skills')),['skill-shelf']);
    assert.equal(JSON.parse(run('doctor','--json','--library',library)).ok,true);
    console.log(`Verified ${archive.name}: ${archive.bytes} bytes, ${files.length} files, standalone install healthy`);
  }
  const pkg=JSON.parse(readFileSync(join(repo,'package.json'),'utf8'));
  assert.equal(Object.keys(pkg.dependencies || {}).length,0);
  const [pack]=JSON.parse(execFileSync('npm',['pack','--dry-run','--json'],{
    cwd:repo,env:{...process.env,npm_config_cache:join(temporary,'npm-cache')},encoding:'utf8',timeout:30000,
  }));
  for(const file of pack.files) assert.ok(file.path==='README.md' || allowed(file.path),file.path);
  console.log(`Verified npm pack allowlist: ${pack.files.length} files; zero runtime dependencies`);
} finally { rmSync(temporary,{recursive:true,force:true}); }

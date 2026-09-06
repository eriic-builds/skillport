import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Release packaging runs on Linux; installing the resulting archives only needs Node.
const repo=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.argv[2] || join(repo,'dist-runtime'));
const temporary=mkdtempSync(join(tmpdir(),'skillport-package-'));
const stage=join(temporary,'skillport');
mkdirSync(stage); mkdirSync(output,{recursive:true});
try {
  for(const path of ['bin','LICENSE']) cpSync(join(repo,path),join(stage,path),{recursive:true});
  const pkg=JSON.parse(readFileSync(join(repo,'package.json'),'utf8'));
  writeFileSync(join(stage,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,type:'module',engines:pkg.engines},null,2)+'\n');
  const files=[];
  const walk=dir=>{
    for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const path=join(dir,entry.name);
      if(entry.isDirectory()) walk(path);
      else files.push(relative(temporary,path));
      utimesSync(path,315532800,315532800);
    }
  };
  walk(stage);
  const stem='skillport-'+pkg.version;
  execFileSync('tar',['--sort=name','--mtime=@315532800','--owner=0','--group=0','--numeric-owner','-czf',join(output,stem+'.tar.gz'),'-C',temporary,'skillport']);
  execFileSync('zip',['-X','-q',join(output,stem+'.zip'),...files],{cwd:temporary});
  const archives=[stem+'.tar.gz',stem+'.zip'].map(name=>{
    const bytes=readFileSync(join(output,name));
    if(bytes.length>250000) throw new Error('Runtime archive exceeds 250 KB: '+name);
    return {name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  });
  writeFileSync(join(output,'SHA256SUMS'),archives.map(a=>a.sha256+'  '+a.name).join('\n')+'\n');
  writeFileSync(join(output,'manifest.json'),JSON.stringify({version:pkg.version,files,archives},null,2)+'\n');
  console.log(JSON.stringify({files:files.length,archives},null,2));
} finally { rmSync(temporary,{recursive:true,force:true}); }

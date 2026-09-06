import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { delimiter, join, dirname, resolve, extname } from 'node:path';

export function resolveCommand(command, { env=process.env, windows=process.platform==='win32' }={}) {
  const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path');
  const directories=/[/\\]/.test(command) ? [''] : (env[pathKey] || '').split(delimiter);
  const suffixes=windows && !extname(command) ? ['', '.exe','.com','.cmd','.bat'] : [''];
  for(const directory of directories) for(const suffix of suffixes) {
    const candidate=directory ? join(directory,command+suffix) : command+suffix;
    try { if(statSync(candidate).isFile()) return resolve(candidate); } catch {}
  }
  return null;
}

export function npmShimTarget(path) {
  const text=readFileSync(path,'utf8');
  // npm's cmd-shim launches Node with a quoted path relative to the shim.
  // Invoke that JS entrypoint directly, retaining argument boundaries.
  const matches=[...text.matchAll(/"%(?:dp0|~dp0)%?\\([^"\r\n]+\.(?:js|cjs|mjs))"/gi)];
  const targets=[...new Set(matches.map(match=>resolve(dirname(path),match[1].replaceAll('\\','/'))))];
  if(targets.length!==1 || !existsSync(targets[0]) || !/node(?:\.exe)?/i.test(text)) return null;
  return targets[0];
}

export function execute(command,args,options={}) {
  const windows=process.platform==='win32';
  const executable=resolveCommand(command,{env:options.env || process.env,windows});
  if(!executable) return {status:null,stdout:'',stderr:'',error:Object.assign(new Error(`Executable not found: ${command}`),{code:'ENOENT'})};
  let target=executable, argv=args;
  if(windows && /\.(cmd|bat)$/i.test(executable)) {
    const script=npmShimTarget(executable);
    if(!script) return {status:null,stdout:'',stderr:'',error:new Error(`Unsupported batch launcher: ${executable}. Use a native executable or a Node npm shim.`)};
    target=process.execPath; argv=[script,...args];
  }
  return spawnSync(target,argv,{encoding:'utf8',timeout:30000,...options,shell:false});
}

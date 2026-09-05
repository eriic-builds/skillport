import { existsSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export const clientNames = ['claude','codex','copilot','vscode','antigravity'];
export function selectClients({args, home, repo, available = () => false}) {
  const index=args.indexOf('--clients');
  let value=index < 0 ? undefined : args[index+1];
  if(index>=0 && (!value || value.startsWith('--'))) throw new Error('--clients requires auto, none, or comma-separated client names');
  if(value === undefined && existsSync(join(repo,'.skillport','local.json'))) {
    const config=JSON.parse(readFileSync(join(repo,'.skillport','local.json'),'utf8'));
    if(!Array.isArray(config.clients) || config.clients.some(name=>!clientNames.includes(name))) throw new Error('Invalid saved client selection');
    return config.clients;
  }
  if(value === 'none') return [];
  if(value === undefined || value === 'auto') {
    const hints={claude:'.claude',codex:'.codex',copilot:'.copilot',vscode:'.vscode',antigravity:'.gemini/antigravity'};
    return clientNames.filter(name=>existsSync(join(home,hints[name])) || available(name==='vscode'?'code':name));
  }
  const names=[...new Set(value.split(','))];
  const invalid=names.filter(name=>!clientNames.includes(name));
  if(invalid.length) throw new Error(`Unknown clients: ${invalid.join(', ')}`);
  return names;
}

export function clientLinks(clients, home, skillsRoot, skills) {
  const links=[];
  if(clients.includes('claude') || clients.includes('vscode')) links.push([join(home,'.claude','skills'),skillsRoot]);
  if(clients.includes('codex')) for(const skill of skills) for(const directory of ['.codex','.agents']) links.push([join(home,directory,'skills',skill.folder),skill.directory]);
  if(clients.includes('antigravity')) links.push([join(home,'.gemini','config','skills'),skillsRoot]);
  return links;
}

export function preflightLinks(links) {
  const errors=[];
  for(const [path,target] of links) {
    let state;
    try { state=lstatSync(path); } catch(error) { if(error.code==='ENOENT') continue; errors.push(`${path}: ${error.message}`); continue; }
    if(!state.isSymbolicLink()) { errors.push(`${path}: existing real file or directory`); continue; }
    try { if(realpathSync(path)!==realpathSync(target)) errors.push(`${path}: foreign link`); }
    catch { errors.push(`${path}: dangling link; resolve it before installing`); }
  }
  if(errors.length) throw new Error(`Client path conflicts:\n${errors.join('\n')}`);
}

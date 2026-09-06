import { existsSync, readFileSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const clientRegistry = {
  claude: {command:'claude',hint:'.claude',roots:['.claude/skills'],mode:'root'},
  codex: {command:'codex',hint:'.codex',roots:['.codex/skills','.agents/skills'],mode:'per-skill'},
  copilot: {command:'copilot',hint:'.copilot',roots:[],mode:'registration'},
  vscode: {command:'code',hint:'.vscode',roots:['.claude/skills'],mode:'root'},
  antigravity: {command:'antigravity',hint:'.gemini/antigravity',roots:['.gemini/config/skills'],mode:'root'},
};
export const manualIntegrations = [
  'Cowork: install the marketplace manually, then refresh and update it after sync.',
  'Desktop Chat uploads are independent snapshots; upload updated copies manually.',
];
export const clientNames = Object.keys(clientRegistry);
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
    return clientNames.filter(name=>existsSync(join(home,clientRegistry[name].hint)) || available(clientRegistry[name].command));
  }
  const names=[...new Set(value.split(','))];
  const invalid=names.filter(name=>!clientNames.includes(name));
  if(invalid.length) throw new Error(`Unknown clients: ${invalid.join(', ')}`);
  return names;
}

export function clientLinks(clients, home, skillsRoot, skills) {
  const links=new Map();
  for(const name of clients) {
    const client=clientRegistry[name];
    for(const root of client.roots) {
      if(client.mode==='per-skill') for(const skill of skills) links.set(join(home,root,skill.folder),skill.directory);
      else links.set(join(home,root),skillsRoot);
    }
  }
  return [...links];
}

export function preflightLinks(links) {
  const errors=[];
  for(const [path,target] of links) {
    for(let parent=dirname(path);dirname(parent)!==parent;parent=dirname(parent)) {
      try {
        lstatSync(parent);
        if(!statSync(parent).isDirectory()) errors.push(`${parent}: parent is not a directory`);
        break;
      } catch(error) {
        if(error.code!=='ENOENT') { errors.push(`${parent}: ${error.message}`);break; }
        // A dangling ancestor link is different from an absent directory.
        try { if(lstatSync(parent).isSymbolicLink()) { errors.push(`${parent}: dangling parent link`);break; } } catch {}
      }
    }
    let state;
    try { state=lstatSync(path); } catch(error) { if(error.code==='ENOENT') continue; errors.push(`${path}: ${error.message}`); continue; }
    if(!state.isSymbolicLink()) { errors.push(`${path}: existing real file or directory`); continue; }
    try { if(realpathSync(path)!==realpathSync(target)) errors.push(`${path}: foreign link`); }
    catch { errors.push(`${path}: dangling link; resolve it before installing`); }
  }
  if(errors.length) throw new Error(`Client path conflicts:\n${errors.join('\n')}`);
}

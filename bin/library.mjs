import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function librarySettings({ args, runtime, home }) {
  const remaining = [], selected = [];
  for (let i=0;i<args.length;i++) {
    if (args[i] !== '--library') { remaining.push(args[i]); continue; }
    const value=args[++i];
    if (!value || value.startsWith('--')) throw new Error('--library requires a path');
    selected.push(resolve(value));
  }
  if (selected.length>1) throw new Error('Specify --library only once');
  let library=selected[0];
  if (!library && existsSync(join(runtime,'skills'))) library=runtime;
  const config=join(home,'.skillport','config.json');
  if (!library && existsSync(config)) {
    const saved=JSON.parse(readFileSync(config,'utf8'));
    if (typeof saved.library !== 'string') throw new Error('Invalid saved library path');
    library=resolve(saved.library);
  }
  return { library: library || join(home,'skillport'), args:remaining, config };
}

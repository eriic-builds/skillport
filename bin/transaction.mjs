import { renameSync } from 'node:fs';

export function moveBatch(moves, apply, rollback = () => {}, rename = renameSync) {
  const completed=[];
  try {
    for(const [source,target] of moves) {
      rename(source,target);
      completed.push([source,target]);
    }
    return apply();
  } catch(error) {
    const failures=[];
    for(const [source,target] of completed.reverse()) {
      try { rename(target,source); } catch(restore) { failures.push(`${target} -> ${source}: ${restore.message}`); }
    }
    try { rollback(); } catch(restore) { failures.push(restore.message); }
    if(failures.length) throw new Error(`${error.message}\nRecovery incomplete:\n${failures.join('\n')}`);
    throw error;
  }
}

import { lstatSync, readlinkSync, realpathSync, unlinkSync } from 'node:fs';
import { dirname, basename, join, resolve, relative, isAbsolute, sep } from 'node:path';

function normalize(path) {
  const absolute = resolve(path);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

export function ownedLink(path, root) {
  let state;
  try { state = lstatSync(path); } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (!state.isSymbolicLink()) return false;
  const rawTarget = resolve(dirname(path), readlinkSync(path));
  const targets = [normalize(rawTarget)];
  // A removed skill can leave a dangling link through a macOS /var alias.
  // Resolve its still-existing parent without requiring the skill to exist.
  try { targets.push(normalize(join(realpathSync(dirname(rawTarget)), basename(rawTarget)))); } catch {}
  const roots = [normalize(root)];
  try { roots.push(normalize(realpathSync(root))); } catch {}
  return targets.some(target => roots.some(base => {
    const child = relative(base, target);
    return child !== '' && child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child);
  }));
}

export function removeOwnedLink(path, root) {
  if (!ownedLink(path, root)) return false;
  unlinkSync(path);
  return true;
}

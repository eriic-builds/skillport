import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const shellQuote = value => "'" + value.replace(/'/g, "'\\''") + "'";
export const powershellQuote = value => "'" + value.replace(/'/g, "''") + "'";

export function profileTarget({ home, windows, env = process.env, explicit }) {
  if (explicit) return explicit;
  if (windows) return env.SKILLPORT_POWERSHELL_PROFILE || null;
  if (env.SHELL?.endsWith('/zsh')) return join(env.ZDOTDIR || home, '.zshrc');
  if (env.SHELL?.endsWith('/bash')) return join(home, process.platform === 'darwin' ? '.bash_profile' : '.bashrc');
  return null;
}

export function updateProfile(path, lines, dryRun = false) {
  const bytes = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe;
  const encoding = utf16 ? 'utf16le' : 'utf8';
  const content = bytes.toString(encoding);
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const start = '# >>> Skillport managed setup >>>';
  const end = '# <<< Skillport managed setup <<<';
  const block = [start, ...lines, end].join(newline);
  const begin = content.indexOf(start);
  const finish = content.indexOf(end);
  if ((begin < 0) !== (finish < 0) || (begin >= 0 && finish < begin)) throw new Error('Incomplete Skillport profile block; restore its markers before retrying.');
  const next = begin >= 0
    ? content.slice(0, begin) + block + content.slice(finish + end.length)
    : content + (content.endsWith('\n') || !content ? '' : newline) + block + newline;
  if (next === content) return false;
  if (!dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path + '.skills-backup')) writeFileSync(path + '.skills-backup', bytes);
    writeFileSync(path, next, encoding);
  }
  return true;
}

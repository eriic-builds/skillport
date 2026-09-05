import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function sandbox(t) {
  const root = mkdtempSync(join(tmpdir(), 'skillport-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "library space's"), home = join(root, 'home');
  mkdirSync(repo); mkdirSync(home);
  cpSync(fileURLToPath(new URL('../../bin', import.meta.url)), join(repo, 'bin'), {recursive:true});
  mkdirSync(join(repo,'skills')); mkdirSync(join(repo,'shelf'));
  return {
    root, repo, home,
    skill(name, shelved = false, content = '') {
      const path = join(repo, shelved ? 'shelf' : 'skills', name);
      mkdirSync(path, {recursive:true});
      writeFileSync(join(path,'SKILL.md'), `---\nname: ${name}\ndescription: Test fixture\n---\n${content}\n`);
      return path;
    },
    run(...args) {
      return spawnSync(process.execPath, [join(repo,'bin','skills.mjs'), ...args], {
        cwd:repo, timeout:15000, encoding:'utf8',
        env:{...process.env,HOME:home,USERPROFILE:home,SHELL:'/bin/zsh',ZDOTDIR:home,SKILLPORT_POWERSHELL_PROFILE:join(home,'profile.ps1')},
      });
    },
  };
}

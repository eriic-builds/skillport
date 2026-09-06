import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, renameSync, lstatSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ownedLink, removeOwnedLink } from '../bin/managed-links.mjs';

test('shelving removes dangling owned links without removing target contents', t => {
  const root=mkdtempSync(join(tmpdir(),'skillport-links-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const library=join(root,'skills'), source=join(library,'example'), link=join(root,'client');
  mkdirSync(source,{recursive:true});
  symlinkSync(source,link,process.platform === 'win32' ? 'junction' : 'dir');
  renameSync(source,join(root,'shelved'));
  assert.equal(existsSync(link),false);
  assert.equal(ownedLink(link,library),true);
  assert.equal(removeOwnedLink(link,library),true);
  assert.throws(()=>lstatSync(link),{code:'ENOENT'});
  assert.ok(existsSync(join(root,'shelved')));
});

test('foreign sibling-prefix links and real directories survive', t => {
  const root=mkdtempSync(join(tmpdir(),'skillport-links-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const library=join(root,'skills'), foreign=join(root,'skills-other','example'), link=join(root,'client');
  mkdirSync(library); mkdirSync(foreign,{recursive:true});
  symlinkSync(foreign,link,process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(removeOwnedLink(link,library),false);
  assert.equal(removeOwnedLink(library,root),false);
  assert.ok(lstatSync(link).isSymbolicLink());
});

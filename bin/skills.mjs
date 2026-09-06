#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execute, resolveCommand, npmShimTarget } from './command.mjs';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { profileTarget, updateProfile, shellQuote, powershellQuote } from './profile.mjs';
import { removeOwnedLink, ownedLink } from './managed-links.mjs';
import { selectClients, clientLinks, preflightLinks } from './clients.mjs';
import { librarySettings } from './library.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const settings = librarySettings({args:process.argv.slice(2), runtime:resolve(scriptDir,'..'), home:homedir()});
const repoRoot = settings.library;
const skillsDir = join(repoRoot, "skills");
const shelfDir = join(repoRoot, "shelf");
const pluginManifestPath = join(repoRoot, ".claude-plugin", "plugin.json");
const home = homedir();
const isWindows = process.platform === "win32";
const builtInNames = new Set([
  "imagegen",
  "openai-docs",
  "plugin-creator",
  "skill-creator",
  "skill-installer",
]);
const commitTrailers = [
  "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
];
const ignoredLibraryEntries = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = execute(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) {
    throw new Error(`${command} could not start: ${result.error.message}`);
  }
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? result.stderr.trim() : "";
    throw new Error(`${command} exited with ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function capture(command, args, options = {}) {
  const result = execute(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.status}`);
  return result.stdout.trim();
}

function pathState(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function linkTarget(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function ensureLink(linkPath, targetPath) {
  if (!existsSync(targetPath)) {
    throw new Error(`Cannot link ${linkPath}: target does not exist: ${targetPath}`);
  }

  const state = pathState(linkPath);
  if (state) {
    if (!state.isSymbolicLink()) {
      throw new Error(
        `${linkPath} is a real file or directory. Move it aside, then run "skills link" again.`,
      );
    }
    const actual = linkTarget(linkPath);
    const expected = realpathSync(targetPath);
    if (actual !== expected) {
      const raw = readlinkSync(linkPath);
      throw new Error(`${linkPath} points to ${raw}, not ${targetPath}. Fix or remove it first.`);
    }
    return "already linked";
  }

  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(targetPath, linkPath, isWindows ? "junction" : "dir");
  return "linked";
}

function parseFrontmatter(filePath) {
  const text = readFileSync(filePath, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { errors: ["missing YAML frontmatter"], metadata: {} };

  const metadata = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    value = value.replace(/^(['"])(.*)\1$/, "$2");
    metadata[key] = value;
  }

  const errors = [];
  if (!metadata.name) errors.push("frontmatter is missing name");
  if (!metadata.description) errors.push("frontmatter is missing description");
  return { errors, metadata };
}

// A reference is only a real resource when it names a concrete file in live
// prose. Fenced blocks hold templates of what a skill writes, and a path
// carrying a placeholder, glob, or shell variable describes a shape rather
// than a file that should exist on disk.
const illustrativeReference = /[<>*?$~]|\{\{/;

function markdownReferences(text) {
  const prose = text.replace(/^ {0,3}```[\s\S]*?^ {0,3}```/gm, "\n");
  const references = new Set(
    [...prose.matchAll(/\]\(([^(){}\s]+\.md)\)/g)].map((match) => match[1]),
  );
  for (const match of prose.matchAll(/`([^`\s{}]+\.md)`/g)) {
    references.add(match[1]);
  }
  for (const reference of references) {
    if (illustrativeReference.test(reference)) references.delete(reference);
  }
  return references;
}

const securityRulesetVersion = "skillport-security-v1";

function sanitizeDisplay(value) {
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function reviewRuleSet() {
  return [
    {
      id: "hidden-unicode",
      kind: "block",
      message: "Contains invisible Unicode characters that can hide malicious instructions.",
      test: (value) => /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/.test(value),
    },
    {
      id: "instruction-override",
      kind: "block",
      message: "Contains instruction-override language that tells the agent to ignore its guardrails.",
      test: (value) =>
        /(ignore\s+previous\s+instructions|you\s+are\s+now|override\s+all\s+(earlier|previous)\s+instructions|treat\s+all\s+earlier\s+directives\s+as\s+untrusted)/i.test(
          value,
        ),
    },
    {
      id: "concealment",
      kind: "block",
      message: "Contains concealment language that asks the agent to hide facts from the user.",
      test: (value) =>
        /(do\s+not\s+tell\s+the\s+user|hide\s+(this|the|it|your\s+findings)\s+from|keep\s+this\s+hidden|silently|secretly\s+run)/i.test(
          value,
        ),
    },
    {
      id: "shell-pipeline",
      kind: "block",
      message: "Contains a shell pipeline that downloads or executes code without explicit approval.",
      test: (value) =>
        /(?:curl|wget|iwr|Invoke-WebRequest|powershell|pwsh)\b[\s\S]{0,180}(?:\|\s*(?:bash|sh|zsh|powershell|pwsh|iex)|\|\s*\w+\s*\|\s*(?:bash|sh|zsh))(?:\s|$)|(?:base64\s+-d\s+\|\s*(?:bash|sh|zsh)|openssl\s+enc.*\|\s*(?:bash|sh|zsh))/i.test(
          value,
        ),
    },
    {
      id: "guardrail-disable",
      kind: "block",
      message: "Disables the agent's safety or permission checks.",
      test: (value) => /--dangerously-skip-permissions|--allow-all-paths|--yolo|--unsafe-perm/i.test(value),
    },
    {
      id: "credential-exfiltration",
      kind: "block",
      message: "Reads a credential or secret and appears to send it somewhere else in the same file.",
      test: (value) => {
        const hasCredential =
          /(GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY|API_KEY|SECRET|PASSWORD|TOKEN)/i.test(
            value,
          );
        const hasExfil = /(https?:\/\/[^\s"'`]+|gist\.github\.com|pastebin|transfer\.sh|0x0\.st|api\.[a-z0-9.-]+\.[a-z]{2,})/i.test(
          value,
        );
        return hasCredential && hasExfil;
      },
    },
  ];
}

function findReviewableFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const child = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(child);
        continue;
      }
      if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (/ /.test(entry.name)) continue;
        if (/(^|\.)\.(git|DS_Store)|~$/.test(lower)) continue;
        if (!/\.(md|txt|js|ts|tsx|jsx|mjs|cjs|json|yaml|yml|bash|sh|zsh|ps1|py|env|ini|cfg|toml|html|xml)$/i.test(lower)) {
          continue;
        }
        files.push(child);
      }
    }
  };
  walk(root);
  return files.sort();
}

function auditSkillForSecurity(root) {
  const fileEntries = findReviewableFiles(root);
  const findings = [];
  const fileFingerprints = [];

  for (const filePath of fileEntries) {
    if (relative(root, filePath) === '.source.json') continue;
    let text = "";
    try {
      text = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const rel = sanitizeDisplay(relative(root, filePath).split("\\").join("/"));
    if (!text.trim()) continue;
    const fingerprint = sha256(text);
    fileFingerprints.push({ path: rel, hash: fingerprint });
    for (const rule of reviewRuleSet()) {
      if (rule.test(text)) {
        findings.push({
          id: rule.id,
          kind: rule.kind,
          file: rel,
          message: `${rule.message} (${rule.id})`,
        });
      }
    }
  }

  const uniqueIds = [...new Set(findings.map((entry) => entry.id))];
  return {
    findings,
    ruleIds: uniqueIds,
    files: fileFingerprints,
  };
}

function buildReviewToken({ source, commit, selection, rulesetVersion, files }) {
  const payload = [
    String(source ?? ""),
    String(commit ?? ""),
    Array.isArray(selection) ? selection.join(",") : String(selection ?? ""),
    rulesetVersion,
    ...files.map(({ path, hash }) => `${path}:${hash}`),
  ].join("\n");
  return sha256(payload);
}

function skillContentHash(root) {
  const entries = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const path = join(directory,entry.name);
      const rel = relative(root,path).split(sep).join('/');
      if (rel === '.source.json') continue;
      if (entry.isSymbolicLink()) throw new Error('Skill contains a symbolic link: ' + rel);
      if (entry.isDirectory()) walk(path);
      else entries.push([rel,sha256(readFileSync(path))]);
    }
  }
  walk(root);
  return sha256(JSON.stringify(entries));
}

function discoverSkills(root = skillsDir) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = join(root, entry.name);
      const skillFile = join(directory, "SKILL.md");
      return { directory, folder: entry.name, skillFile };
    })
    .filter((skill) => existsSync(skill.skillFile))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

const useCaseFile = "USE_CASES.html";
const useCaseDraftMarker = "<!-- SKILLS-DRAFT -->";
// USE_CASES.html is human documentation rather than a resource the agent loads,
// so it must not push a skill into the multi-file class that needs --add-dir.
const ignoredSkillEntries = new Set(["SKILL.md", useCaseFile, "Thumbs.db", "desktop.ini"]);

function multiFileSkills(skills) {
  return skills.filter((skill) => {
    const entries = readdirSync(skill.directory, { withFileTypes: true });
    return entries.some((entry) => {
      if (entry.name.startsWith(".") || ignoredSkillEntries.has(entry.name)) return false;
      return entry.isDirectory() || entry.isFile();
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function starterPrompts(name, description) {
  const topic = String(description ?? "")
    .replace(/^use\s+(this\s+)?(skill\s+)?(when|to|for)\s+/i, "")
    .split(/\s+[-–—]\s+/)[0]
    .replace(/[.\s]+$/, "")
    .trim();
  const subject = topic || `the ${name} workflow`;
  // Descriptions are written either as "Use when creating..." or as a plain
  // imperative, so cased both ways to keep the generated prompts readable.
  const acronym = /^[A-Z]{2}/.test(subject);
  const lower = acronym ? subject : subject.charAt(0).toLowerCase() + subject.slice(1);
  const upper = subject.charAt(0).toUpperCase() + subject.slice(1);
  return [
    `Use the ${name} skill.`,
    `Help me with this: ${lower}.`,
    `${upper}. Walk me through it step by step.`,
  ];
}

function renderUseCases(name, description, isMultiFile) {
  const prompts = starterPrompts(name, description)
    .map(
      (prompt) =>
        `      <div class="prompt"><p>${escapeHtml(prompt)}</p>` +
        `<button type="button" class="copy">Copy</button></div>`,
    )
    .join("\n");

  const copilotNote = isMultiFile
    ? `
    <section class="card">
      <span class="tag warn">Read this first</span>
      <h2>Copilot needs permission for this one</h2>
      <p>This skill keeps supporting files next to <code>SKILL.md</code>, and Copilot CLI
        only reads files below the folder you started it in. Either add the wrapper from
        <code>README.md</code> to your shell profile, or run
        <code>skills use ${escapeHtml(name)}</code> inside the project that needs it.</p>
    </section>
`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(name)} — how to use it</title>
  <style>
    :root {
      --ink: #17231f; --muted: #607069; --paper: #f8f5ed; --card: #fffdf7;
      --line: #d9ded5; --green: #176b4d; --green-dark: #0c4c35; --green-soft: #e6f2ea;
      --gold: #d49325; --gold-soft: #fff0cf;
      --shadow: 0 18px 48px rgba(23, 35, 31, 0.1); --radius: 18px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; color: var(--ink);
      background:
        radial-gradient(circle at 10% 0%, rgba(212, 147, 37, 0.16), transparent 30rem),
        linear-gradient(180deg, #f4f7f1 0, var(--paper) 30rem);
      font: 16px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button { cursor: pointer; font: inherit; }
    code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 0.92em; }
    a { color: var(--green-dark); }
    .shell { width: min(880px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 54px 0 26px; }
    .eyebrow {
      color: var(--green); font-size: 0.78rem; font-weight: 800;
      letter-spacing: 0.12em; text-transform: uppercase;
    }
    h1 {
      margin: 10px 0 12px; font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(2.2rem, 6vw, 3.8rem); font-weight: 500;
      letter-spacing: -0.045em; line-height: 1;
    }
    .lede { max-width: 680px; margin: 0; color: var(--muted); font-size: 1.08rem; }
    main { padding-bottom: 64px; }
    .card {
      margin-bottom: 18px; padding: clamp(20px, 4vw, 32px);
      border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--card); box-shadow: var(--shadow);
    }
    h2 {
      margin: 0 0 12px; font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(1.5rem, 3.4vw, 2.1rem); font-weight: 500;
      letter-spacing: -0.03em; line-height: 1.15;
    }
    p { margin: 0 0 14px; }
    p:last-child { margin-bottom: 0; }
    .tag {
      display: inline-block; margin-bottom: 10px; padding: 4px 11px;
      border-radius: 20px; background: var(--green-soft); color: var(--green-dark);
      font-size: 0.74rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
    }
    .tag.warn { background: var(--gold-soft); color: #7a5209; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: left; }
    th { color: var(--muted); font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; }
    tr:last-child td { border-bottom: 0; }
    .prompt {
      display: flex; gap: 12px; align-items: center; justify-content: space-between;
      margin-top: 10px; padding: 14px 16px; border: 1px solid var(--line);
      border-radius: 12px; background: #fff;
    }
    .prompt p { margin: 0; }
    .copy {
      flex: none; padding: 7px 14px; border: 1px solid var(--line);
      border-radius: 9px; background: var(--green-soft); color: var(--green-dark); font-weight: 700;
    }
    .copy:hover { background: var(--green); color: #fff; }
    .draft {
      margin-bottom: 6px; padding: 12px 14px; border-radius: 12px;
      background: var(--gold-soft); color: #7a5209; font-size: 0.94rem;
    }
    ul { margin: 0; padding-left: 20px; }
    li { margin-bottom: 6px; }
    footer { padding: 8px 0 40px; color: var(--muted); font-size: 0.88rem; }
  </style>
</head>
<body>
  <header class="shell">
    <div class="eyebrow">Skillport · How to use it</div>
    <h1>${escapeHtml(name)}</h1>
    <p class="lede">${escapeHtml(description)}</p>
  </header>

  <main class="shell">
    <section class="card">
      <span class="tag">Start it</span>
      <h2>Two ways to trigger this</h2>
      <p><strong>Just describe the task.</strong> Every client matches this skill against the
        summary above, so plain language usually works on its own.</p>
      <p><strong>Or name it directly</strong> when you want to be certain:</p>
      <table>
        <tr><th>Client</th><th>Type this</th></tr>
        <tr><td>Claude Code</td><td><code>/${escapeHtml(name)}</code></td></tr>
        <tr><td>Copilot CLI</td><td><code>Use the /${escapeHtml(name)} skill.</code></td></tr>
        <tr><td>Codex CLI</td><td><code>$${escapeHtml(name)}</code></td></tr>
        <tr><td>ChatGPT desktop</td><td>Type <code>@</code>, then pick <strong>${escapeHtml(name)}</strong></td></tr>
        <tr><td>Gemini Antigravity</td><td><code>Use the ${escapeHtml(name)} skill.</code></td></tr>
        <tr><td>VS Code</td><td><code>Use the ${escapeHtml(name)} skill.</code></td></tr>
      </table>
    </section>

    <section class="card">
      <span class="tag">Copy and paste</span>
      <h2>Sample prompts</h2>
${useCaseDraftMarker}
      <div class="draft">These are auto-generated starters. Replace them with prompts you would
        actually type, then delete the <code>SKILLS-DRAFT</code> comment line in this file so
        <code>skills doctor</code> stops flagging it as a draft.</div>
${prompts}
    </section>

    <section class="card">
      <h2>Good to know</h2>
      <ul>
        <li>Clients cache their skill list, so restart the client after this skill changes.</li>
        <li>Only the summary at the top is loaded up front. The full instructions load when the
          skill actually fires, so keeping it in the library costs almost nothing.</li>
        <li>Run <code>skills list</code> to see everything available, or <code>skills doctor</code>
          if a client cannot find this one.</li>
        <li>Added a skill by dropping its folder into <code>skills/</code>? Run
          <code>skills link</code> to finish wiring it, then <code>skills sync</code> to publish it.</li>
      </ul>
    </section>
${copilotNote}
    <footer>Scaffolded by <code>skills usecases</code> or <code>skills link</code>. Edit it freely —
      nothing regenerates it unless you pass <code>--force</code>.</footer>
  </main>

  <script>
    document.querySelectorAll(".copy").forEach((button) => {
      button.addEventListener("click", async () => {
        const text = button.parentElement.querySelector("p").textContent;
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = "Copied";
        } catch {
          button.textContent = "Copy failed";
        }
        setTimeout(() => { button.textContent = "Copy"; }, 1400);
      });
    });
  </script>
</body>
</html>
`;
}

function useCaseState(skill) {
  const path = join(skill.directory, useCaseFile);
  if (!existsSync(path)) return "missing";
  return readFileSync(path, "utf8").includes(useCaseDraftMarker) ? "draft" : "ready";
}

function writeUseCases(skill, isMultiFile) {
  const { metadata } = parseFrontmatter(skill.skillFile);
  const description = metadata.description ?? "No description set in SKILL.md.";
  writeFileSync(
    join(skill.directory, useCaseFile),
    renderUseCases(metadata.name ?? skill.folder, description, isMultiFile),
  );
}

function useCaseDocs(names, options = {}) {
  const skills = discoverSkills();
  if (!skills.length) {
    console.log(`The library is empty, so there is nothing to document.`);
    return;
  }

  let selected = skills;
  if (names.length) {
    for (const name of names) assertSimpleName(name);
    const available = new Map(skills.map((skill) => [skill.folder, skill]));
    const missing = names.filter((name) => !available.has(name));
    if (missing.length) {
      throw new Error(
        `Not in the library: ${missing.join(", ")}. Run "skills list" to see what is available.`,
      );
    }
    selected = names.map((name) => available.get(name));
  }

  const multi = new Set(multiFileSkills(skills).map((skill) => skill.folder));
  let written = 0;
  for (const skill of selected) {
    if (useCaseState(skill) !== "missing" && !options.force) {
      console.log(`${skill.folder}: ${useCaseFile} already exists; left unchanged.`);
      continue;
    }
    writeUseCases(skill, multi.has(skill.folder));
    console.log(`${skill.folder}: wrote ${join("skills", skill.folder, useCaseFile)}`);
    written += 1;
  }

  if (written) {
    console.log(
      `\nOpen the file to read it. Replace the starter prompts with ones you would really ` +
        `type, then run "skills sync" to publish.`,
    );
  }
}

function libraryPathVariants() {
  const variants = new Set([repoRoot, repoRoot.split(sep).join("\\")]);
  const rel = relative(home, repoRoot);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
    for (const prefix of ["$HOME", "${HOME}", "~", "$env:USERPROFILE", "$HOME"]) {
      for (const separator of ["/", "\\"]) {
        variants.add(`${prefix}${separator}${rel.split(sep).join(separator)}`);
      }
    }
  }
  return [...variants];
}

function copilotWrapperInstalled() {
  const candidates = isWindows
    ? [
        join("Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
        join("Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
      ]
    : [".zshrc", ".bashrc", ".bash_profile", ".profile"];
  const variants = libraryPathVariants();
  for (const file of candidates) {
    const path = join(home, file);
    if (!existsSync(path)) continue;
    const active = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    const matched = active.some(
      (line) => line.includes("--add-dir") && variants.some((variant) => line.includes(variant)),
    );
    if (matched) return file;
  }
  return null;
}

function copilotWrapperInstruction() {
  return isWindows
    ? `function copilot { copilot.exe --add-dir "${repoRoot}" @args }`
    : `alias copilot='copilot --add-dir ${repoRoot}'`;
}

function antigravityInstalled() {
  const candidates = [
    join(home, ".gemini", "antigravity"),
    join(home, ".local", "bin", "agy"),
    join(home, ".local", "bin", "antigravity"),
    join(home, ".local", "bin", "antigravity-ide"),
    join(home, "Applications", "Antigravity IDE"),
    "/usr/bin/antigravity",
    "/usr/local/bin/antigravity",
    "/opt/Antigravity/antigravity",
  ];
  if (process.platform === "darwin") {
    candidates.push("/Applications/Antigravity.app");
  }
  if (isWindows && process.env.LOCALAPPDATA) {
    candidates.push(
      join(process.env.LOCALAPPDATA, "agy", "bin", "agy.exe"),
      join(
        process.env.LOCALAPPDATA,
        "Programs",
        "Antigravity IDE",
        "Antigravity IDE.exe",
      ),
    );
  }
  return candidates.some((candidate) => existsSync(candidate));
}

function validateSkill(skill, options = {}) {
  const { errors, metadata } = parseFrontmatter(skill.skillFile);
  if (metadata.name && metadata.name !== skill.folder) {
    errors.push(`frontmatter name "${metadata.name}" must match folder "${skill.folder}"`);
  }
  if (metadata.name && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name)) {
    errors.push("name must use lowercase letters, numbers, and single hyphens");
  }
  if (metadata.name && builtInNames.has(metadata.name)) {
    errors.push(`name collides with Codex built-in skill "${metadata.name}"`);
  }
  if (options.checkReferences !== false) {
    const text = readFileSync(skill.skillFile, "utf8");
    const explicitReferences = markdownReferences(text);
    explicitReferences.delete("SKILL.md");
    for (const reference of explicitReferences) {
      if (/^(?:https?:)?\/\//i.test(reference)) continue;
      let referencedPath;
      try {
        referencedPath = safeDestination(skill.directory, reference);
      } catch (error) {
        errors.push(error.message);
        continue;
      }
      if (!existsSync(referencedPath)) {
        errors.push(`referenced Markdown file is missing: ${reference}`);
      }
    }
  }
  return { errors, metadata };
}

function scaffoldMissingUseCases(skills) {
  const multi = new Set(multiFileSkills(skills).map((skill) => skill.folder));
  const created = [];
  for (const skill of skills) {
    if (useCaseState(skill) !== "missing") continue;
    try {
      writeUseCases(skill, multi.has(skill.folder));
      created.push(skill.folder);
      console.log(`Created skills/${skill.folder}/${useCaseFile}`);
    } catch (error) {
      console.warn(
        `WARN: could not write skills/${skill.folder}/${useCaseFile}: ${error.message}`,
      );
    }
  }
  return created;
}

function removeLinks(skillName) {
  for (const client of ['.codex', '.agents']) {
    removeOwnedLink(join(home, client, 'skills', skillName), skillsDir);
  }
}

function selectedClients() {
  return selectClients({ args: process.argv.slice(2), home, repo: repoRoot, available: command => {
    const probe = execute(command, ['--version'], { encoding: 'utf8', timeout: 3000 });
    return !probe.error && probe.status === 0;
  }});
}

function linkAll({ dryRun = false } = {}) {
  const clients = selectedClients();
  const skills = discoverSkills();
  const links = clientLinks(clients, home, skillsDir, skills);
  preflightLinks(links);
  if (clients.includes('codex')) {
    const active = new Set(skills.map(skill => skill.folder));
    for (const client of ['.codex','.agents']) {
      const directory = join(home,client,'skills');
      if (!existsSync(directory)) continue;
      for (const entry of readdirSync(directory)) {
        if (entry === '.system' || active.has(entry)) continue;
        const path = join(directory,entry);
        if (!ownedLink(path,skillsDir)) continue;
        if (dryRun) console.log('Would remove obsolete managed link: ' + path);
        else removeOwnedLink(path,skillsDir);
      }
    }
  }
  console.log(`Selected clients: ${clients.join(', ') || 'none'}`);
  for (const [path, target] of links) {
    if (dryRun) console.log(`Would link ${path} -> ${target}`);
    else console.log(`${path}: ${ensureLink(path, target)}`);
  }
  if (clients.includes('copilot')) {
    if (dryRun) console.log(`Would register Copilot library: ${skillsDir}`);
    else {
      const result = run('copilot', ['skill', 'add', skillsDir], { capture: true });
      console.log(result.stdout.trim());
    }
  }
  if (!dryRun) {
    mkdirSync(join(repoRoot, '.skillport'), { recursive: true });
    writeFileSync(join(repoRoot, '.skillport', 'local.json'), JSON.stringify({ clients }, null, 2) + '\n');
    console.log('Restart selected AI clients to refresh their skill inventory.');
  }
}

function checkLink(label, linkPath, targetPath, errors) {
  const state = pathState(linkPath);
  if (!state) {
    errors.push(`${label}: missing ${linkPath}. Run "skills link".`);
    return;
  }
  if (!state.isSymbolicLink()) {
    errors.push(`${label}: ${linkPath} is a real directory, not a managed link.`);
    return;
  }
  const actual = linkTarget(linkPath);
  if (!actual) {
    errors.push(`${label}: ${linkPath} is dangling. Run "skills link" after restoring the repo.`);
    return;
  }
  if (actual !== realpathSync(targetPath)) {
    errors.push(`${label}: ${linkPath} points to ${actual}, expected ${targetPath}.`);
    return;
  }
  console.log(`PASS: ${label}`);
}

function pointsIntoLibrary(root, linkText) {
  const resolved = isAbsolute(linkText) ? linkText : resolve(root, linkText);
  const roots = new Set([skillsDir]);
  try {
    roots.add(realpathSync(skillsDir));
  } catch {
    // The library path is checked elsewhere; fall back to the lexical path.
  }
  for (const base of roots) {
    const rel = relative(base, resolved);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return true;
  }
  return false;
}

function checkOrphanLinks(label, root, skillFolders, errors) {
  if (!existsSync(root)) return;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    errors.push(`${label}: cannot read ${root}: ${error.message}`);
    return;
  }
  for (const entry of entries) {
    if (entry.name === ".system" || ignoredLibraryEntries.has(entry.name)) continue;
    if (skillFolders.has(entry.name)) continue;
    if (!entry.isSymbolicLink()) continue;
    const linkPath = join(root, entry.name);
    let linkText;
    try {
      linkText = readlinkSync(linkPath);
    } catch {
      continue;
    }
    if (!ownedLink(linkPath, skillsDir)) continue;
    errors.push(
      `${label}: ${linkPath} is left over. It points into this library at ${linkText}, ` +
        `but no skill named "${entry.name}" exists. Remove it with: rm "${linkPath}"`,
    );
  }
}

function gitState(errors) {
  const gitDir = join(repoRoot, ".git");
  if (!existsSync(gitDir)) {
    errors.push(`Git: ${repoRoot} is not a Git clone.`);
    return;
  }

  const status = capture("git", ["status", "--short"]);
  console.log(status ? `INFO: Git has local changes:\n${status}` : "PASS: Git working tree is clean");

  const upstream = run("git", ["rev-parse", "--abbrev-ref", "@{upstream}"], {
    capture: true,
    allowFailure: true,
  });
  if (upstream.status !== 0) {
    errors.push('Git: no upstream branch. Run "git push -u origin main".');
    return;
  }

  const counts = capture("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]);
  const [ahead, behind] = counts.split(/\s+/).map(Number);
  if (ahead || behind) {
    console.log(`INFO: Git is ${ahead} commit(s) ahead and ${behind} commit(s) behind.`);
  } else {
    console.log("PASS: Git matches the last fetched upstream state");
  }
}

function normalizeRemote(value) {
  return String(value)
    .trim()
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function gitRemoteIdentity() {
  const remote = run("git", ["remote", "get-url", "origin"], {
    capture: true,
    allowFailure: true,
  });
  if (remote.status !== 0) {
    return null;
  }

  const repository = normalizeRemote(remote.stdout.trim());
  const ownerMatch = repository.match(/^https:\/\/github\.com\/([^/]+)\/[^/]+$/);
  return {
    repository,
    owner: ownerMatch ? ownerMatch[1] : null,
  };
}

function adoptIdentity(options = {}) {
  const identity = gitRemoteIdentity();
  if (!identity) {
    throw new Error('No GitHub origin configured. Run "git remote add origin <repo-url>" first.');
  }

  const pluginPath = pluginManifestPath;
  const marketplacePath = join(repoRoot, ".claude-plugin", "marketplace.json");
  const plugin = existsSync(pluginPath) ? readJson(pluginPath) : { name: basename(repoRoot), version: "0.1.0" };
  const marketplace = existsSync(marketplacePath) ? readJson(marketplacePath) : { name: basename(repoRoot), plugins: [] };

  let changed = false;
  if (plugin.repository !== identity.repository) {
    plugin.repository = identity.repository;
    changed = true;
  }
  if (plugin.author?.name !== identity.owner) {
    plugin.author = { ...(plugin.author ?? {}), name: identity.owner };
    changed = true;
  }
  if (marketplace.owner?.name !== identity.owner) {
    marketplace.owner = { ...(marketplace.owner ?? {}), name: identity.owner };
    changed = true;
  }
  if (marketplace.name !== plugin.name && !marketplace.name) {
    marketplace.name = plugin.name;
    changed = true;
  }

  if (!options.dryRun) {
    if (existsSync(pluginPath)) writeJson(pluginPath, plugin);
    if (existsSync(marketplacePath)) writeJson(marketplacePath, marketplace);
  }

  if (!changed) {
    console.log(`PASS: library identity already matches Git origin ${identity.repository}`);
    return { changed: false, identity };
  }

  console.log(
    `Updated repository identity to ${identity.repository} and owner ${identity.owner}.`,
  );
  return { changed: true, identity };
}

function shellProfileTarget() {
  if (isWindows) {
    const candidates = [
      join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
      join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    return join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
  }

  const candidates = [
    join(home, ".bash_profile"),
    join(home, ".zshrc"),
    join(home, ".bashrc"),
    join(home, ".profile"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return process.env.SHELL?.includes("zsh") ? join(home, ".zshrc") : join(home, ".bash_profile");
}

function shellProfileLines() {
  const skillsLine = isWindows
    ? `function skills { & "${repoRoot.replace(/\\/g, '\\\\')}\\bin\\skills.ps1" @args }`
    : `alias skills='${repoRoot}/bin/skills'`;
  const lines = [skillsLine];

  if (multiFileSkills(discoverSkills()).length) {
    lines.push(copilotWrapperInstruction());
  }

  return lines;
}

function legacyEnsureShellSetup(options = {}) {
  const profilePath = shellProfileTarget();
  const lines = shellProfileLines();
  const content = existsSync(profilePath) ? readFileSync(profilePath, "utf8") : "";
  const existing = content.split(/\r?\n/);
  const next = [...existing];
  let changed = false;

  for (const line of lines) {
    if (existing.some((entry) => entry.trim() === line)) {
      continue;
    }
    if (existing.some((entry) => entry.includes("--add-dir") && entry.includes(repoRoot))) {
      continue;
    }
    if (line.includes("--add-dir") && content.includes("--add-dir") && content.includes(repoRoot)) {
      continue;
    }
    next.push(`\n# Added by skills setup\n${line}`);
    changed = true;
  }

  if (!changed) {
    console.log(`PASS: shell profile already configured at ${profilePath}`);
    return { changed: false, path: profilePath };
  }

  if (options.dryRun) {
    console.log(`Would update ${profilePath}:`);
    for (const line of lines) console.log(`  ${line}`);
    return { changed: true, path: profilePath, dryRun: true };
  }

  mkdirSync(dirname(profilePath), { recursive: true });
  const backupPath = `${profilePath}.skills-backup`;
  if (!existsSync(backupPath)) {
    writeFileSync(backupPath, content || "");
  }
  writeFileSync(profilePath, `${next.join("\n")}\n`);
  console.log(`Updated shell profile at ${profilePath}`);
  return { changed: true, path: profilePath };
}

function ensureShellSetup(options = {}) {
  const index = process.argv.indexOf('--profile');
  if (index >= 0 && (!process.argv[index + 1] || process.argv[index + 1].startsWith('--'))) throw new Error('--profile requires a path');
  const profilePath = profileTarget({ home, windows: isWindows, explicit: index >= 0 ? resolve(process.argv[index + 1]) : undefined });
  const quote = isWindows ? powershellQuote : shellQuote;
  const lines = [isWindows
    ? `function skills { & ${quote(process.execPath)} ${quote(join(scriptDir, 'skills.mjs'))} --library ${quote(repoRoot)} @args }`
    : `skills() { ${quote(process.execPath)} ${quote(join(scriptDir, 'skills.mjs'))} --library ${quote(repoRoot)} "$@"; }`];
  if (selectedClients().includes('copilot') && multiFileSkills(discoverSkills()).length) {
    const launcher = resolveCommand('copilot');
    if (!launcher) throw new Error('Selected Copilot executable is missing; install it or deselect copilot.');
    const script = isWindows && /\.(cmd|bat)$/i.test(launcher) ? npmShimTarget(launcher) : null;
    const invocation = script ? `${quote(process.execPath)} ${quote(script)}` : quote(launcher);
    lines.push(isWindows
      ? `function copilot { & ${invocation} --add-dir ${quote(repoRoot)} @args }`
      : `copilot() { ${invocation} --add-dir ${quote(repoRoot)} "$@"; }`);
  }
  if (!profilePath) {
    console.log('Shell profile could not be determined. Use --profile <path> or add this manually:');
    console.log(lines.join('\n'));
    return { changed: false };
  }
  const changed = updateProfile(profilePath, lines, options.dryRun);
  console.log(`${options.dryRun ? 'Would configure' : changed ? 'Updated' : 'Already configured'} shell profile: ${profilePath}`);
  console.log(`Open a new shell to use skills, or load ${quote(profilePath)} in your current shell.`);
  return { changed, path: profilePath };
}

function pluginMetadataState(errors) {
  if (!existsSync(pluginManifestPath)) {
    errors.push(`Plugin metadata: missing ${pluginManifestPath}.`);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(pluginManifestPath, "utf8"));
  } catch (error) {
    errors.push(`Plugin metadata: cannot parse ${pluginManifestPath}: ${error.message}`);
    return;
  }

  const remote = run("git", ["remote", "get-url", "origin"], {
    capture: true,
    allowFailure: true,
  });
  if (remote.status !== 0) {
    console.log('INFO: No Git "origin" found; skipped plugin repository identity check.');
    return;
  }

  const expectedRepository = normalizeRemote(remote.stdout);
  const manifestRepository = normalizeRemote(manifest.repository);
  if (manifestRepository !== expectedRepository) {
    errors.push(
      `Plugin metadata: repository "${manifest.repository ?? "(missing)"}" does not match ` +
        `Git origin "${remote.stdout.trim()}". Update .claude-plugin/plugin.json.`,
    );
    return;
  }

  const owner = manifest.author?.name;
  const ownerMatch = expectedRepository.match(/^https:\/\/github\.com\/([^/]+)\/[^/]+$/);
  if (ownerMatch && owner && owner !== ownerMatch[1]) {
    errors.push(
      `Plugin metadata: author "${owner}" does not match GitHub owner "${ownerMatch[1]}". ` +
        `Update .claude-plugin/plugin.json.`,
    );
    return;
  }
  console.log("PASS: plugin metadata matches Git origin");
}

function commandSucceeded(command, args) {
  const result = execute(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  return !result.error && result.status === 0;
}

function probeClient(command, args) {
  const result = execute(command, args, {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error?.code === "ENOENT") return { state: "missing" };
  if (result.error) return { state: "broken", detail: result.error.message };
  if (result.status !== 0) {
    return { state: "broken", detail: (result.stderr || result.stdout || "").trim() };
  }
  return { state: "ok", stdout: (result.stdout || "").trim() };
}

function collectDoctorState() {
  const errors = [], info = [], skillState = [];
  const log = console.log;
  // Existing checks are synchronous. Collect their diagnostics so JSON stdout
  // contains exactly one document, including when a check throws.
  console.log = (...items) => info.push(items.join(' '));
  let clients = [];
  try {
    clients = selectedClients();
    const skills = discoverSkills();
    const names = new Set();
    for (const skill of skills) {
      const result = validateSkill(skill);
      const name = String(result.metadata.name || skill.folder).toLowerCase();
      if (names.has(name)) result.errors.push('duplicate skill name');
      names.add(name);
      skillState.push({ name: skill.folder, valid: result.errors.length === 0, errors: result.errors, useCaseState: useCaseState(skill) });
      errors.push(...result.errors.map(error => skill.folder + ': ' + error));
    }
    const folders = new Set(skills.map(skill => skill.folder));
    if (existsSync(skillsDir)) for (const entry of readdirSync(skillsDir)) {
      if (!folders.has(entry) && !ignoredLibraryEntries.has(entry)) errors.push('Unexpected library entry: ' + entry);
    }
    for (const [path, target] of clientLinks(clients, home, skillsDir, skills)) {
      checkLink(path, path, target, errors);
    }
    if (clients.includes('codex')) {
      checkOrphanLinks('Codex', join(home, '.codex', 'skills'), folders, errors);
      checkOrphanLinks('Shared agents', join(home, '.agents', 'skills'), folders, errors);
    }
    for (const client of clients) {
      const command = client === 'vscode' ? 'code' : client;
      const probe = probeClient(command, client === 'copilot' ? ['skill', 'list'] : ['--version']);
      if (probe.state === 'broken') errors.push(client + ': ' + probe.detail);
      else if (probe.state === 'missing') info.push(client + ': CLI unavailable; filesystem links checked');
      else if (client === 'copilot') {
        for (const skill of skills) if (!probe.stdout.includes(skill.folder)) errors.push('Copilot: skill not listed: ' + skill.folder);
      }
    }
    if (clients.includes('copilot') && multiFileSkills(skills).length && !copilotWrapperInstalled()) {
      errors.push('Copilot file allowance missing: ' + copilotWrapperInstruction());
    }
    for (const skill of discoverSkills(shelfDir)) {
      if (names.has(skill.folder.toLowerCase())) errors.push('Skill exists in active library and shelf: ' + skill.folder);
    }
    if (existsSync(join(repoRoot, '.git'))) {
      pluginMetadataState(errors);
      gitState(errors);
    } else {
      info.push('Standalone library: Git sync and plugin identity checks skipped.');
    }
    info.push('Selected clients: ' + (clients.join(', ') || 'none'));
    info.push('Restart clients after changing active skills. Project copies and manual uploads update separately.');
  } catch (error) {
    errors.push(error.message);
  } finally {
    console.log = log;
  }
  return { ok: errors.length === 0, errors, info, clients, skills: skillState };
}

function doctor() {
  const state = collectDoctorState();
  for (const message of state.info) console.log(message);
  for (const message of state.errors) console.error('ERROR: ' + message);
  console.log(state.ok ? 'All checks passed.' : 'Doctor found problems.');
  if (!state.ok) process.exitCode = 1;
}

function shelveSkills(names) {
  names = [...new Set(names)];
  mkdirSync(shelfDir, { recursive: true });
  const skills = discoverSkills();
  const shelved = discoverSkills(shelfDir);
  const skillMap = new Map(skills.map((s) => [s.folder, s]));
  const shelvedMap = new Map(shelved.map((s) => [s.folder, s]));

  for (const name of names) {
    if (!skillMap.has(name)) {
      throw new Error(`Skill "${name}" not found in skills/`);
    }
    if (shelvedMap.has(name) || pathState(join(shelfDir, name))) {
      throw new Error(`Skill "${name}" is already shelved`);
    }
    if (name === "skill-shelf") {
      throw new Error(`Cannot shelve "skill-shelf" — it is required for the shelf to work`);
    }
  }

  for (const name of names) {
    const skill = skillMap.get(name);
    const shelfTarget = join(shelfDir, name);
    renameSync(skill.directory, shelfTarget);
    removeLinks(name);
    console.log(`Shelved ${name} — stored in shelf/, no longer loads.`);
    console.log(`Bring it back with:  skills unshelve ${name}`);
  }

  console.log(
    `\nRestart your AI clients to apply changes, then run "skills sync" if this was intentional.`,
  );
}

function unshelveSkills(names) {
  names = [...new Set(names)];
  const shelved = discoverSkills(shelfDir);
  const shelvedMap = new Map(shelved.map((s) => [s.folder, s]));
  mkdirSync(skillsDir, { recursive: true });
  const skills = discoverSkills();
  const skillMap = new Map(skills.map((s) => [s.folder, s]));

  for (const name of names) {
    if (!shelvedMap.has(name)) {
      throw new Error(`Skill "${name}" not found in shelf/`);
    }
    if (skillMap.has(name) || pathState(join(skillsDir, name))) {
      throw new Error(`Skill "${name}" is already active in skills/`);
    }
  }

  for (const name of names) {
    const skill = shelvedMap.get(name);
    const validation = validateSkill(skill);
    if (validation.errors.length) {
      throw new Error(
        `Cannot unshelve "${name}" — the skill is broken:\n` +
          validation.errors.map((e) => `  ${e}`).join("\n"),
      );
    }
    const security = auditSkillForSecurity(skill.directory);
    const sourcePath = join(skill.directory,'.source.json');
    const approval = existsSync(sourcePath) ? readJson(sourcePath) : null;
    const approved = approval?.overrideAccepted === true && approval.rulesetVersion === securityRulesetVersion && approval.contentHash === skillContentHash(skill.directory);
    if (security.findings.length && !approved) {
      console.error(`Cannot unshelve "${name}" because the skill fails the import security review:`);
      for (const finding of security.findings) {
        console.error(`- [${finding.id}] ${finding.file}: ${finding.message}`);
      }
      throw new Error("Blocked import review while unshelving the skill.");
    }
  }

  for (const name of names) {
    renameSync(shelvedMap.get(name).directory, join(skillsDir, name));
  }

  linkAll();
}

function newSkill(name) {
  assertSimpleName(name);
  if (builtInNames.has(name)) {
    throw new Error(`"${name}" is reserved by Codex and cannot be used as a skill name.`);
  }
  const directory = join(skillsDir, name);
  if (pathState(directory)) {
    throw new Error(`A skill named "${name}" already exists. Choose another name.`);
  }

  const description = `Use this skill when working on ${name.replaceAll("-", " ")}.`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nAdd the instructions for this skill here.\n`,
  );
  writeFileSync(join(directory, useCaseFile), renderUseCases(name, description, false));
  console.log(`Created ${name}/SKILL.md and ${name}/${useCaseFile}.`);
  console.log(
    `Edit the description and instructions, replace the starter prompts, then run "skills doctor".`,
  );
}

function listShelf() {
  const shelved = discoverSkills(shelfDir);
  if (!shelved.length) {
    console.log("The shelf is empty.");
    return;
  }
  console.log("Skills on the shelf:\n");
  for (const skill of shelved) {
    const validation = validateSkill(skill);
    const metadata = validation.metadata || {};
    const status = validation.errors.length ? " (⚠ BROKEN)" : "";
    console.log(`  ${skill.folder}${status}`);
    if (metadata.description) {
      console.log(`    ${metadata.description}`);
    }
  }
}

function syncRepo(message) {
  if (!existsSync(join(repoRoot,'.git'))) throw new Error('Sync requires a Git-backed library. Use a clone of your own repository with --library.');
  const operationMarkers = [
    ["rebase", "rebase-merge"],
    ["rebase", "rebase-apply"],
    ["merge", "MERGE_HEAD"],
    ["cherry-pick", "CHERRY_PICK_HEAD"],
    ["revert", "REVERT_HEAD"],
  ];
  for (const [operation, marker] of operationMarkers) {
    const markerPath = capture("git", ["rev-parse", "--git-path", marker]);
    if (existsSync(resolve(repoRoot, markerPath))) {
      throw new Error(
        `Git already has a ${operation} in progress. Finish or abort it before running "skills sync".`,
      );
    }
  }

  const workingSkillChanges = capture("git", ["status", "--short", "--", "skills"]);
  const workingManifestChanges = capture("git", [
    "status",
    "--short",
    "--",
    ".claude-plugin/plugin.json",
  ]);
  const upstream = run("git", ["rev-parse", "--verify", "@{upstream}"], {
    capture: true,
    allowFailure: true,
  });
  let committedSkillChanges = false;
  let committedManifestChanges = false;
  if (upstream.status === 0) {
    committedSkillChanges =
      run("git", ["diff", "--quiet", "@{upstream}..HEAD", "--", "skills"], {
        capture: true,
        allowFailure: true,
      }).status === 1;
    committedManifestChanges =
      run(
        "git",
        ["diff", "--quiet", "@{upstream}..HEAD", "--", ".claude-plugin/plugin.json"],
        { capture: true, allowFailure: true },
      ).status === 1;
  }

  const versionBumpNeeded =
    (workingSkillChanges && !workingManifestChanges) ||
    (committedSkillChanges && !committedManifestChanges && !workingManifestChanges);
  if (versionBumpNeeded) {
    const manifest = JSON.parse(readFileSync(pluginManifestPath, "utf8"));
    const match = String(manifest.version).match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
      throw new Error(
        `Claude plugin version must use MAJOR.MINOR.PATCH format: ${manifest.version}`,
      );
    }
    manifest.version = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
    writeFileSync(pluginManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Claude plugin version: ${manifest.version}`);
  }

  run("git", ["add", "-A"]);
  const staged = run("git", ["diff", "--cached", "--quiet"], { allowFailure: true });
  if (staged.status !== 0) {
    run("git", [
      "commit",
      "-m",
      message || "chore: sync global skills",
      "-m",
      commitTrailers.join("\n"),
    ]);
  } else {
    console.log("No local changes to commit.");
  }

  const pull = run("git", ["pull", "--rebase"], { allowFailure: true });
  if (pull.status !== 0) {
    const rebasePaths = ["rebase-merge", "rebase-apply"].map((marker) =>
      resolve(repoRoot, capture("git", ["rev-parse", "--git-path", marker])),
    );
    if (rebasePaths.some((path) => existsSync(path))) {
      run("git", ["rebase", "--abort"], { allowFailure: true });
    }
    throw new Error(
      'Git could not pull the remote changes. Any rebase started by this command was safely aborted. Run "git status", fix the reported problem, then run "skills sync" again.',
    );
  }
  // Reconcile after receiving remote skill changes, even if pushing fails.
  linkAll();
  run("git", ["push"]);
}

function findSkillDirectories(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const child = join(directory, entry.name);
      if (!entry.isDirectory()) continue;
      if (existsSync(join(child, "SKILL.md"))) found.push(child);
      else walk(child);
    }
  };
  if (existsSync(join(root, "SKILL.md"))) found.push(root);
  walk(root);

  // Repositories commonly mirror one skill into several client directories
  // (.claude/skills, .agents/skills, .codex/skills). Keep the least nested
  // copy so an import takes the canonical source, not a delivery mirror.
  const byName = new Map();
  for (const directory of found) {
    const depth = relative(root, directory).split(/[\\/]/).filter(Boolean).length;
    const current = byName.get(basename(directory));
    if (!current || depth < current.depth) byName.set(basename(directory), { directory, depth });
  }
  return [...byName.values()].map((entry) => entry.directory).sort();
}

function findFiles(root, predicate) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const child = join(directory, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (predicate(child)) found.push(child);
    }
  };
  walk(root);
  return found;
}

function safeDestination(root, reference) {
  if (isAbsolute(reference)) {
    throw new Error(`Skill references an absolute path, which is not portable: ${reference}`);
  }
  const destination = resolve(root, reference);
  const resolvedRoot = resolve(root);
  if (destination !== resolvedRoot && !destination.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`Skill reference escapes its directory: ${reference}`);
  }
  return destination;
}

function safeSourceFile(root, candidate) {
  const lexicalRoot = resolve(root);
  const resolvedRoot = realpathSync(root);
  const resolvedCandidate = realpathSync(candidate);
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)
  ) {
    throw new Error(`Referenced resource resolves outside its repository: ${candidate}`);
  }

  let current = lexicalRoot;
  for (const component of relative(lexicalRoot, resolve(candidate)).split(/[\\/]/)) {
    if (!component) continue;
    current = join(current, component);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`Referenced resource crosses a symbolic link: ${candidate}`);
    }
  }
  return resolvedCandidate;
}

function copyReferencedMarkdown(sourceRepo, selected, stage) {
  const skillText = readFileSync(join(selected, "SKILL.md"), "utf8");
  const references = markdownReferences(skillText);
  references.delete("SKILL.md");

  const markdownFiles = findFiles(
    sourceRepo,
    (filePath) => {
      if (!filePath.toLowerCase().endsWith(".md")) return false;
      const fromSelected = relative(selected, filePath);
      return fromSelected.startsWith("..") || isAbsolute(fromSelected);
    },
  );
  const copied = [];

  for (const reference of references) {
    const destination = safeDestination(stage, reference);
    if (existsSync(destination)) continue;
    const exact = safeDestination(sourceRepo, reference);
    const matches = existsSync(exact)
      ? [exact]
      : markdownFiles.filter((filePath) => basename(filePath) === basename(reference));
    if (matches.length !== 1) continue;
    const source = safeSourceFile(sourceRepo, matches[0]);

    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
    copied.push(reference);
  }

  if (copied.length) {
    console.log(`Included referenced resources: ${copied.sort().join(", ")}`);
  }
}

function findSymlinks(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const child = join(directory, entry.name);
      if (entry.isSymbolicLink()) found.push(child);
      else if (entry.isDirectory()) walk(child);
    }
  };
  walk(root);
  return found;
}

function copySkillDirectory(source, destination) {
  const symlinks = findSymlinks(source);
  if (symlinks.length) {
    throw new Error(
      `Skill contains symbolic links, which are not imported for safety: ${symlinks
        .map((path) => relative(source, path))
        .join(", ")}`,
    );
  }
  cpSync(source, destination, {
    recursive: true,
    dereference: false,
    filter: (path) => {
      const child = relative(source, path).split(/[\\/]/)[0];
      return child !== ".git" && child !== "node_modules";
    },
  });
}

async function chooseSkill(candidates, requested) {
  if (requested) {
    const matched = candidates.filter((path) => basename(path) === requested);
    if (!matched.length) {
      throw new Error(
        `No skill named "${requested}" in the repository. Found: ${candidates
          .map((path) => basename(path))
          .join(", ")}.`,
      );
    }
    if (matched.length > 1) {
      throw new Error(`Repository has more than one directory named "${requested}".`);
    }
    return matched[0];
  }
  if (candidates.length === 1) return candidates[0];
  if (!process.stdin.isTTY) {
    throw new Error(
      `Repository contains multiple skills: ${candidates.map((path) => basename(path)).join(", ")}. ` +
        `Name one, pass --all to take every skill, or re-run interactively.`,
    );
  }
  console.log("Repository contains multiple skills:");
  candidates.forEach((path, index) => console.log(`${index + 1}. ${path}`));
  const input = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await input.question("Choose a skill number: ");
  input.close();
  const selected = Number(answer) - 1;
  if (!Number.isInteger(selected) || !candidates[selected]) {
    throw new Error("Invalid skill selection.");
  }
  return candidates[selected];
}

function setupWarnings(directory) {
  const names = readdirSync(directory);
  const flagged = names.filter((name) =>
    /^(package\.json|requirements.*\.txt|pyproject\.toml|setup\.py|install.*|.*\.(sh|ps1|bat|cmd))$/i.test(
      name,
    ),
  );
  if (flagged.length) {
    console.warn(
      `WARN: imported skill includes possible setup or executable files: ${flagged.join(", ")}`,
    );
    console.warn("No setup command was run. Review the skill's instructions before executing anything.");
  }
}

async function importSkill(url, options = {}) {
  if (!/^https:\/\/github\.com\//i.test(url)) {
    throw new Error("Import currently accepts HTTPS GitHub repository URLs only.");
  }

  mkdirSync(repoRoot, {recursive:true});
  const tempRoot = mkdtempSync(join(repoRoot, ".skillport-import-"));
  const cloneDir = join(tempRoot, "repo");
  const installed = [];
  let importCommitted = false;
  const staged = [];
  const isShelfImport = options.all;
  const targetRoot = isShelfImport ? shelfDir : skillsDir;
  const reviewedToken = options.reviewed ?? null;
  const gitBacked = existsSync(join(repoRoot,'.git'));

  try {
    const stagedGit = gitBacked ? run("git", ["diff", "--cached", "--quiet"], { allowFailure: true }) : {status:0};
    if (stagedGit.status !== 0) {
      throw new Error(
        'Git already has staged changes. Commit or unstage them before running "skills import".',
      );
    }
    run("git", ["clone", "--depth", "1", url, cloneDir], { cwd: tempRoot });
    const candidates = findSkillDirectories(cloneDir);
    if (!candidates.length) throw new Error("No SKILL.md directories found in the repository.");
    const chosen = options.all
      ? candidates
      : [await chooseSkill(candidates, options.only)];
    const sha = capture("git", ["rev-parse", "HEAD"], { cwd: cloneDir });
    const importedNames = new Set();

    for (const selected of chosen) {
      const parsed = parseFrontmatter(join(selected, "SKILL.md"));
      if (parsed.errors.length) throw new Error(parsed.errors.join("; "));
      const skill = {
        directory: selected,
        folder: selected === cloneDir ? parsed.metadata.name : basename(selected),
        skillFile: join(selected, "SKILL.md"),
      };
      const result = validateSkill(skill, { checkReferences: false });
      if (result.errors.length) throw new Error(`${skill.folder}: ${result.errors.join("; ")}`);
      const key = skill.folder.toLowerCase();
      if (importedNames.has(key)) throw new Error('Duplicate imported skill name: ' + skill.folder);
      importedNames.add(key);

      const target = join(targetRoot, skill.folder);
      if (pathState(target)) {
        throw new Error(`${target} already exists. Resolve the name conflict before importing.`);
      }
      const otherTarget = isShelfImport ? join(skillsDir, skill.folder) : join(shelfDir, skill.folder);
      if (pathState(otherTarget)) {
        throw new Error(
          `${skill.folder} exists in ${isShelfImport ? "skills" : "shelf"}/. ` +
            `Resolve the name conflict before importing.`,
        );
      }

      const stage = join(tempRoot, `stage-${skill.folder}-${process.pid}`);
      copySkillDirectory(selected, stage);
      copyReferencedMarkdown(cloneDir, selected, stage);
      const stagedSkill = {
        directory: stage,
        folder: skill.folder,
        skillFile: join(stage, "SKILL.md"),
      };
      const stagedResult = validateSkill(stagedSkill);
      if (stagedResult.errors.length) {
        throw new Error(`${skill.folder}: ${stagedResult.errors.join("; ")}`);
      }
      writeUseCases(stagedSkill, multiFileSkills([stagedSkill]).length > 0);

      const audit = auditSkillForSecurity(stage);
      const reviewToken = buildReviewToken({
        source: normalizeRemote(url),
        commit: sha,
        selection: [skill.folder],
        rulesetVersion: securityRulesetVersion,
        files: audit.files,
      });

      staged.push({
        folder: skill.folder,
        stage,
        target,
        reviewToken,
        audit,
      });
    }

    const aggregateFindings = staged.flatMap((entry) =>
      entry.audit.findings.map((finding) => ({ ...finding, folder: entry.folder })),
    );
    const aggregateToken = buildReviewToken({
      source: normalizeRemote(url),
      commit: sha,
      selection: staged.map((entry) => entry.folder),
      rulesetVersion: securityRulesetVersion,
      files: staged.flatMap((entry) => entry.audit.files.map(file=>({...file,path:entry.folder+'/'+file.path}))),
    });

    if (aggregateFindings.length) {
      if (reviewedToken && reviewedToken === aggregateToken) {
        console.log(`Security review accepted via override token for ${staged.map((entry) => entry.folder).join(", ")}.`);
      } else {
        console.error("Import blocked by security review:");
        for (const finding of aggregateFindings) {
          console.error(`- [${finding.id}] ${finding.folder}: ${finding.file}: ${finding.message}`);
        }
        console.error(`Review token: ${aggregateToken}`);
        throw new Error(
          "Import cancelled because the selected skill(s) contain blocking security indicators.",
        );
      }
    }

    if (reviewedToken && reviewedToken !== aggregateToken) {
      throw new Error("Review token does not match the current import content.");
    }

    mkdirSync(targetRoot, {recursive:true});
    for (const entry of staged) {
      const sourceState = pathState(entry.stage);
      if (!sourceState) continue;
      const reviewMetadata = {
        source: normalizeRemote(url),
        commit: sha,
        importedAt: new Date().toISOString(),
        rulesetVersion: securityRulesetVersion,
        reviewToken: entry.reviewToken,
        reviewedRuleIds: entry.audit.ruleIds,
        overrideAccepted: reviewedToken === aggregateToken,
        contentHash: skillContentHash(entry.stage),
      };
      writeFileSync(
        join(entry.stage, ".source.json"),
        `${JSON.stringify(reviewMetadata, null, 2)}\n`,
      );
      setupWarnings(entry.stage);
      renameSync(entry.stage, entry.target);
      entry.stage = null;
      installed.push({ folder: entry.folder, target: entry.target });
      const location = isShelfImport ? "shelf" : "skills";
      console.log(`Imported ${entry.folder} to ${location}/ from ${url} at ${sha}.`);
    }

    const targetPaths = installed.map((entry) => relative(repoRoot, entry.target));
    const location = isShelfImport ? " to shelf" : "";
    const summary =
      installed.length === 1
        ? `feat: import${location} ${installed[0].folder}`
        : `feat: import${location} ${installed.length} skills from ${url}`;
    if (gitBacked) {
    run("git", ["add", ...targetPaths]);
    run("git", [
      "commit",
      "-m",
      summary,
      "-m",
      commitTrailers.join("\n"),
      "--",
      ...targetPaths,
    ]);
    }
    importCommitted = true;
    // Link only if not a shelf import; shelf imports don't need wiring.
    // If later unshelved, linkAll() will wire them.
    if (!isShelfImport) {
      linkAll();
    }
    const msg = isShelfImport
      ? `Import saved to shelf/. Run "skills unshelve <name>" to activate, then restart your AI clients.`
      : `Import saved locally.${gitBacked ? ' Run skills sync to publish it.' : ''}`;
    console.log(msg);
  } catch (error) {
    if (importCommitted) {
      throw new Error(`Import was saved and its files have been retained. Client setup failed: ${error.message}. Resolve the client error, then run skills link.`);
    }
    if (gitBacked && installed.length) {
      const paths = installed.map(entry => relative(repoRoot, entry.target));
      const unstage = run('git', ['reset', '--', ...paths], { capture: true, allowFailure: true });
      if (unstage.status !== 0) throw new Error(`Import failed: ${error.message}. Could not unstage imported paths; files were retained for recovery.`);
    }
    for (const entry of installed) rmSync(entry.target, { recursive: true, force: true });
    for (const entry of staged) {
      if (entry.stage) rmSync(entry.stage, { recursive: true, force: true });
    }
    throw error;
  } finally {
    for (const entry of staged) {
      if (entry.stage) rmSync(entry.stage, { recursive: true, force: true });
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

const projectMarker = ".from-library.json";

const projectSkillDirs = [
  [".claude", "skills"],
  [".agents", "skills"],
];

function projectSkillsRoots(cwd) {
  return projectSkillDirs.map((parts) => join(cwd, ...parts));
}

function contains(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function assertSimpleName(name) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(
      `Invalid skill name "${name}". Names are lowercase words separated by hyphens.`,
    );
  }
}

function listSkills() {
  const skills = discoverSkills();
  if (!skills.length) {
    console.log('The library is empty. Add a skill with "skills import <GitHub URL>".');
    return;
  }
  const multi = new Set(multiFileSkills(skills).map((skill) => skill.folder));
  for (const skill of skills) {
    const { metadata } = parseFrontmatter(skill.skillFile);
    console.log(`${skill.folder}  (${multi.has(skill.folder) ? "multi-file" : "single-file"})`);
    console.log(`  ${metadata.description ?? "(no description)"}\n`);
  }

  const totalChars = skills.reduce((sum, skill) => {
    const { metadata } = parseFrontmatter(skill.skillFile);
    return sum + (metadata.description ?? "").length;
  }, 0);
  const budgetEstimate = 8000;
  const percentage = Math.round((totalChars / budgetEstimate) * 100);

  const shelved = discoverSkills(shelfDir);
  const shelfInfo = shelved.length ? ` · ${shelved.length} shelved` : "";

  console.log(
    `${skills.length} active · ${totalChars} chars · ${percentage}% of budget${shelfInfo}\n` +
      `Every client already sees all of them. Use "skills use <name>" only when a project ` +
      `should carry its own copy.`,
  );
}

function projectDestinationRoots(cwd) {
  if (contains(repoRoot, cwd)) {
    throw new Error(
      "Run this from the project that needs the skill, not from inside the library itself.",
    );
  }
  const roots = projectSkillsRoots(cwd);
  for (const root of roots) {
    if (existsSync(root) && contains(skillsDir, realpathSync(root))) {
      throw new Error(
        `${root} resolves into the library itself, so copying here would overwrite ` +
          `the originals. Run this from a project directory instead.`,
      );
    }
  }
  return roots;
}

function useSkills(names) {
  if (!names.length) throw new Error('Name at least one skill. Run "skills list" to see them.');
  for (const name of names) assertSimpleName(name);

  const cwd = resolve(process.cwd());
  const destinationRoots = projectDestinationRoots(cwd);
  const available = new Map(discoverSkills().map((skill) => [skill.folder, skill]));
  const shelved = new Map(discoverSkills(shelfDir).map((skill) => [skill.folder, skill]));
  const missing = names.filter((name) => !available.has(name));

  if (missing.length) {
    const shelfMatches = missing.filter((name) => shelved.has(name));
    if (shelfMatches.length) {
      throw new Error(
        `Not available: ${shelfMatches.join(", ")}. These are on the shelf. ` +
        `Run "skills unshelve <name>" to activate them first, then restart your AI client.`,
      );
    }
    throw new Error(
      `Not in the library: ${missing.join(", ")}. Run "skills list" to see what is available.`,
    );
  }

  let commit = null;
  try {
    commit = capture("git", ["rev-parse", "HEAD"]);
  } catch {
    commit = null;
  }

  const targets = [];
  for (const destinationRoot of destinationRoots) {
    for (const name of names) {
      const destination = join(destinationRoot, name);
      if (!contains(destinationRoot, destination)) {
        throw new Error(`Refusing to write outside ${destinationRoot}.`);
      }
      if (pathState(destination) && !existsSync(join(destination, projectMarker))) {
        throw new Error(
          `${destination} already exists and was not created by "skills use". ` +
            `Move it aside first if you want the library copy.`,
        );
      }
      targets.push({ destinationRoot, name, destination });
    }
  }

  for (const { destinationRoot, name, destination } of targets) {
    mkdirSync(destinationRoot, { recursive: true });
    const stage = join(destinationRoot, `.use-${name}-${process.pid}`);
    try {
      rmSync(stage, { recursive: true, force: true });
      copySkillDirectory(available.get(name).directory, stage);
      writeFileSync(
        join(stage, projectMarker),
        `${JSON.stringify({ skill: name, library: repoRoot, commit, copiedAt: new Date().toISOString() }, null, 2)}\n`,
      );
      rmSync(destination, { recursive: true, force: true });
      renameSync(stage, destination);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
    console.log(`Copied ${name} -> ${relative(cwd, destination)}`);
  }

  console.log(
    `\nClaude Code reads .claude/skills/; Codex reads .agents/skills/; Copilot reads both\n` +
      `and lists the skill only once. These are copies, so their supporting files work\n` +
      `without the --add-dir wrapper. Re-run "skills use" after the library changes, and\n` +
      `"skills unuse <name>" to remove them.`,
  );
  if (existsSync(join(cwd, ".git"))) {
    console.log(
      `\nThis project is a Git repository. Commit .claude/skills/ and .agents/skills/ to share ` +
        `these skills with collaborators, or add both to .gitignore to keep them private.`,
    );
  }
}

function unuseSkills(names) {
  if (!names.length) throw new Error("Name at least one skill to remove.");
  for (const name of names) assertSimpleName(name);

  const cwd = resolve(process.cwd());
  const destinationRoots = projectDestinationRoots(cwd);

  const targets = [];
  for (const destinationRoot of destinationRoots) {
    for (const name of names) {
      const destination = join(destinationRoot, name);
      if (!contains(destinationRoot, destination)) {
        throw new Error(`Refusing to delete outside ${destinationRoot}.`);
      }
      if (!pathState(destination)) continue;
      if (!existsSync(join(destination, projectMarker))) {
        throw new Error(
          `${destination} was not created by "skills use", so it will not be deleted. ` +
            `Remove it yourself if that is what you want.`,
        );
      }
      targets.push({ destination });
    }
  }

  if (!targets.length) {
    console.log("Nothing to remove: no copied skills found in this project.");
    return;
  }

  for (const { destination } of targets) {
    rmSync(destination, { recursive: true, force: true });
    console.log(`Removed ${relative(cwd, destination)}`);
  }
}

function usage() {
  console.log(`Usage: skills <command>

Commands:
  link                 Connect supported AI clients to this skill library
  list                 Show every skill in the library
  new <name>           Scaffold a new skill with valid starter files
  shelf                List skills stored on the shelf
  usecases [name]...   Write ${useCaseFile} for a skill, or every skill missing one
  use <name>...        Copy named skills into the current project
  unuse <name>...      Remove copied skills from the current project
  shelve <name>...     Move skills to the shelf (hidden from AI tools)
  unshelve <name>...   Restore shelved skills to active use
  adopt                Match plugin and marketplace metadata to the current Git remote
  shell-setup          Add the local skills alias and Copilot allowlist to your profile
  install [--dry-run] [--yes] [--no-shell]
                       Prepare the library for this machine with adopt + link + shell setup
  doctor [--json]      Validate skills, client links, and Git state
  sync [message]       Commit, rebase-pull, and push library changes safely
  import <GitHub URL> [skill] [--reviewed <token>]
                       Import a complete skill directory at a pinned commit.
                       Name a skill, or pass --all, for repositories holding several.

Options:
  --library <path>     Use a separate writable skill library
  --clients <names>    auto, none, or claude,codex,copilot,vscode,antigravity
  --force              With "usecases", overwrite files that already exist
  --all                With "import", take every skill in the repository
  --reviewed <token>   Re-approve an import after reviewing the prior security findings
  --dry-run            Preview shell and install changes without writing them
  --yes                Confirm non-interactive install actions`);
}

async function main() {
  const [command, ...args] = settings.args;
  try {
    switch (command) {
      case "link":
        linkAll({ dryRun: args.includes('--dry-run') });
        break;
      case "list":
        listSkills();
        break;
      case "new":
        if (args.length !== 1) throw new Error('new requires exactly one skill name');
        newSkill(args[0]);
        break;
      case "shelf":
        listShelf();
        break;
      case "usecases":
        useCaseDocs(
          args.filter((arg) => arg !== "--force"),
          { force: args.includes("--force") },
        );
        break;
      case "use":
        useSkills(args);
        break;
      case "unuse":
        unuseSkills(args);
        break;
      case "shelve":
        if (!args.length) throw new Error("shelve requires at least one skill name");
        shelveSkills(args);
        break;
      case "unshelve":
        if (!args.length) throw new Error("unshelve requires at least one skill name");
        unshelveSkills(args);
        break;
      case "adopt":
        adoptIdentity({ dryRun: args.includes("--dry-run") });
        break;
      case "shell-setup":
        ensureShellSetup({ dryRun: args.includes("--dry-run") });
        break;
      case "install": {
        const dryRun = args.includes("--dry-run");
        const noShell = args.includes("--no-shell");
        const confirm = args.includes("--yes") || dryRun;
        if (dryRun) {
          console.log("Install dry run: would adopt the GitHub identity, link the library, and configure the shell.");
          if (existsSync(join(repoRoot,'.git'))) adoptIdentity({ dryRun: true });
          console.log(`Would initialize library at ${repoRoot}`);
          linkAll({ dryRun: true });
          if (!noShell) ensureShellSetup({ dryRun: true });
          console.log("Install dry run: no filesystem changes were written.");
          break;
        }
        if (!confirm) {
          console.log("Install preview: run with --yes to apply changes or --dry-run to preview only.");
          break;
        }

        preflightLinks(clientLinks(selectedClients(), home, skillsDir, discoverSkills()));
        const claudeLink = join(home, ".claude", "skills");
        const claudeState = pathState(claudeLink);
        if ((selectedClients().includes('claude') || selectedClients().includes('vscode')) && claudeState && claudeState.isSymbolicLink()) {
          const target = linkTarget(claudeLink);
          if (target && target !== realpathSync(skillsDir)) {
            throw new Error(
              `Refusing to install into ${claudeLink}: it already points to ${target}. ` +
                `Remove or rename that link before installing this repo, or run in an isolated HOME for a fresh install.`,
            );
          }
        }

        mkdirSync(skillsDir, {recursive:true});
        mkdirSync(shelfDir, {recursive:true});
        if (existsSync(join(repoRoot,'.git'))) adoptIdentity({ dryRun: false });
        linkAll();
        if (!noShell) {
          ensureShellSetup({ dryRun: false });
        }
        mkdirSync(dirname(settings.config), {recursive:true});
        writeJson(settings.config, {library:repoRoot});
        break;
      }
      case "doctor":
        if (args.includes("--json")) {
          const state = collectDoctorState();
          console.log(JSON.stringify(state, null, 2));
          if (!state.ok) process.exitCode = 1;
        } else {
          doctor();
        }
        break;
      case "sync":
        syncRepo(args.join(" "));
        break;
      case "import": {
        const reviewedIndex = args.indexOf("--reviewed");
        const reviewedToken = reviewedIndex >= 0 ? args[reviewedIndex + 1] : null;
        const filteredArgs = reviewedIndex >= 0
          ? args.filter((_, index) => index !== reviewedIndex && index !== reviewedIndex + 1)
          : args;
        const positional = filteredArgs.filter((arg) => !arg.startsWith("--"));
        if (!positional[0]) throw new Error("Import requires a GitHub repository URL.");
        if (reviewedIndex >= 0 && !reviewedToken) {
          throw new Error("Import requires a value after --reviewed.");
        }
        await importSkill(positional[0], {
          only: positional[1],
          all: filteredArgs.includes("--all"),
          reviewed: reviewedToken,
        });
        break;
      }
      case "--help":
      case "-h":
      case undefined:
        usage();
        break;
      default:
        throw new Error(`Unknown command "${command}". Run "skills --help".`);
    }
  } catch (error) {
    fail(error.message);
  }
}

await main();

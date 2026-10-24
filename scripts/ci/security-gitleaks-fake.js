#!/usr/bin/env node
// Test double for the gitleaks `git` subcommand used by
// security-gitleaks-suppression.test.js when no real binary is available
// (GITLEAKS_BIN). It mirrors the gitleaks v8.30.1 loading rules that matter for
// suppression (cmd/root.go): config from --config, then GITLEAKS_CONFIG,
// GITLEAKS_CONFIG_TOML, then <source>/.gitleaks.toml; ignore fingerprints from
// --gitleaks-ignore-path (file or folder) and ALSO <source>/.gitleaksignore;
// inline `gitleaks:allow` honored unless --ignore-gitleaks-allow. Only
// `[[rules]] id/regex` and `regexes` allowlists are modelled.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { env } = process;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'git') throw new Error('fake supports only `gitleaks git`');
  const flags = { ignoreAllow: false, source: '.' };
  const valued = {
    '--config': 'config',
    '--exit-code': 'exitCode',
    '--gitleaks-ignore-path': 'ignorePath',
    '--log-opts': 'logOpts',
    '--report-format': 'format',
    '--report-path': 'report',
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (valued[arg]) flags[valued[arg]] = rest[++index];
    else if (arg === '--ignore-gitleaks-allow') flags.ignoreAllow = true;
    else if (arg === '--redact' || arg === '--no-banner') continue;
    else if (arg.startsWith('-')) throw new Error(`unmodelled flag ${arg}`);
    else flags.source = arg;
  }
  return flags;
}

function loadConfig(flags) {
  const local = path.join(flags.source, '.gitleaks.toml');
  if (flags.config) return fs.readFileSync(flags.config, 'utf8');
  if (env.GITLEAKS_CONFIG) return fs.readFileSync(env.GITLEAKS_CONFIG, 'utf8');
  if (env.GITLEAKS_CONFIG_TOML) return env.GITLEAKS_CONFIG_TOML;
  return fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : '';
}

function parseConfig(text) {
  const rules = [];
  for (const block of text.split(/^\[\[rules\]\]\s*$/mu).slice(1)) {
    const id = /^id\s*=\s*"([^"]+)"/mu.exec(block)?.[1];
    const regex = /^regex\s*=\s*'''(.+?)'''/mu.exec(block)?.[1];
    if (id && regex) rules.push({ id, regex: new RegExp(regex, 'u') });
  }
  const allow = [...text.matchAll(/'''(.+?)'''/gu)]
    .filter((match) =>
      /regexes\s*=\s*\[[^\]]*$/u.test(text.slice(0, match.index))
    )
    .map((match) => new RegExp(match[1], 'u'));
  return { allow, rules };
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function loadIgnores(flags) {
  const ignorePath = flags.ignorePath ?? '.';
  const files = [
    ignorePath,
    path.join(ignorePath, '.gitleaksignore'),
    path.join(flags.source, '.gitleaksignore'),
  ].filter(isFile);
  return new Set(
    files.flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
    )
  );
}

function addedLines(source, logOpts) {
  const log = execFileSync(
    'git',
    [
      'log',
      '-p',
      '-U0',
      '--format=commit %H',
      ...String(logOpts ?? '')
        .split(/\s+/u)
        .filter(Boolean),
    ],
    { cwd: source, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const lines = [];
  let commit = '';
  let file = '';
  let line = 0;
  for (const text of log.split('\n')) {
    if (text.startsWith('commit ')) commit = text.slice(7);
    else if (text.startsWith('+++ ')) file = text.replace(/^\+\+\+ b\//u, '');
    else if (text.startsWith('@@')) {
      line = Number(/\+(\d+)/u.exec(text)?.[1] ?? 0);
    } else if (text.startsWith('+')) {
      lines.push({ commit, file, line, text: text.slice(1) });
      line += 1;
    }
  }
  return lines;
}

function scan(flags) {
  const { allow, rules } = parseConfig(loadConfig(flags));
  const ignores = loadIgnores(flags);
  const findings = [];
  for (const added of addedLines(flags.source, flags.logOpts)) {
    for (const rule of rules) {
      const match = rule.regex.exec(added.text);
      if (!match) continue;
      if (!flags.ignoreAllow && added.text.includes('gitleaks:allow')) continue;
      if (allow.some((pattern) => pattern.test(match[0]))) continue;
      const fingerprint = `${added.commit}:${added.file}:${rule.id}:${added.line}`;
      if (ignores.has(fingerprint)) continue;
      findings.push({
        Commit: added.commit,
        File: added.file,
        Fingerprint: fingerprint,
        Match: 'REDACTED',
        RuleID: rule.id,
        Secret: 'REDACTED',
        StartLine: added.line,
      });
    }
  }
  return findings;
}

if (require.main === module) {
  const flags = parseArgs(process.argv.slice(2));
  const findings = scan(flags);
  if (flags.report) fs.writeFileSync(flags.report, JSON.stringify(findings));
  if (findings.length > 0) process.exitCode = Number(flags.exitCode ?? 1);
}

module.exports = { parseArgs, scan };

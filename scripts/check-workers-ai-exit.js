#!/usr/bin/env node
// Fails when a Worker config declares an AI binding or application code calls
// the Workers AI binding, a @cf/ model id, the /ai/run/ REST API, or workers-ai.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SELF = new Set([
  'scripts/check-workers-ai-exit.js',
  'scripts/check-workers-ai-exit.test.js',
]);
const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.py',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

function configNamePattern() {
  const prefix = 'wran' + 'gler';
  return new RegExp(`(?:^|/)${prefix}[^/]*\\.(?:jsonc?|toml)$`);
}

function trackedFiles(repoRoot) {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readObject(source) {
  let depth = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return source.slice(0, index + 1);
    }
  }
  return source;
}

function bindingFindings(source, file) {
  const stripped = stripComments(source);
  const findings = [];
  const key = /["']ai["']\s*:/g;
  for (const match of stripped.matchAll(key)) {
    const rest = stripped.slice(match.index + match[0].length).trimStart();
    if (!rest.startsWith('{')) continue;
    if (/\bbinding\b\s*:/.test(readObject(rest)))
      findings.push(`${file}: declares an ai binding`);
  }
  if (/^\s*\[ai\]\s*$/m.test(stripped))
    findings.push(`${file}: declares an ai binding`);
  if (/^\s*ai\s*=\s*\{[^}\n]*\bbinding\b/m.test(stripped))
    findings.push(`${file}: declares an ai binding`);
  return [...new Set(findings)];
}

function invocationFindings(source, file) {
  const typeDeclaration = file.endsWith('.d.ts');
  const envAi = /env\s*(?:\.\s*AI(?![\w$])|\[\s*['"]AI['"]\s*\])/;
  const modelId = new RegExp('@' + 'cf/');
  const restApi = /\/ai\/run\//;
  const gateway = 'workers' + '-ai';
  const findings = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const at = `${file}:${index + 1}`;
    if (envAi.test(line)) findings.push(`${at}: calls env.AI`);
    if (!typeDeclaration && modelId.test(line))
      findings.push(`${at}: uses a Workers AI @cf/ model id`);
    if (restApi.test(line))
      findings.push(`${at}: calls the Workers AI REST /ai/run/ API`);
    if (line.includes(gateway))
      findings.push(`${at}: routes through workers-ai`);
  }
  return findings;
}

function workersAiFindings(repoRoot = REPO_ROOT) {
  const configName = configNamePattern();
  const findings = [];
  for (const file of trackedFiles(repoRoot)) {
    if (SELF.has(file)) continue;
    const extension = path.extname(file).toLowerCase();
    const config = configName.test(file);
    if (!config && !SOURCE_EXTENSIONS.has(extension)) continue;
    let source;
    try {
      source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EISDIR') continue;
      throw error;
    }
    if (config) findings.push(...bindingFindings(source, file));
    if (SOURCE_EXTENSIONS.has(extension) || config)
      findings.push(...invocationFindings(source, file));
  }
  return findings;
}

module.exports = {
  bindingFindings,
  invocationFindings,
  workersAiFindings,
};

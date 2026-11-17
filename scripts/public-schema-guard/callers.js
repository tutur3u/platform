/**
 * Direct client access to relations recorded as moved to private. Clients
 * (browser modules, the Flutter app) must use server routes; server code must
 * address the private schema explicitly.
 */
const fs = require('node:fs');
const path = require('node:path');

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.wrangler',
  'build',
  'coverage',
  'dist',
  '__tests__',
]);
const PAUSED_APPS = new Set(['backend', 'tanstack-web']);
const LOOKBEHIND = 160;

function walk(root, accept, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, accept, out);
    } else if (accept(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function sourceRoots(repoRoot) {
  const roots = [];
  for (const top of ['apps', 'packages']) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(repoRoot, top));
    } catch {
      continue;
    }
    for (const name of names) {
      if (top === 'apps' && PAUSED_APPS.has(name)) continue;
      roots.push(path.join(repoRoot, top, name, 'src'));
    }
  }
  return roots;
}

const isSource = (name) =>
  /\.(?:[cm]?[jt]sx?)$/u.test(name) &&
  !/\.(?:test|spec|stories)\.[cm]?[jt]sx?$/u.test(name);

function isBrowserModule(text) {
  return (
    /^\s*['"]use client['"]/mu.test(text.slice(0, 400)) ||
    text.includes('@tuturuuu/supabase/next/client') ||
    text.includes('next/auth-browser') ||
    text.includes('createBrowserClient')
  );
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * Scan one file. `kind` is ts, dart or python. Returns violation objects.
 */
function scanText({ file, text, kind, moved }) {
  const findings = [];
  const pattern =
    kind === 'python'
      ? /\.table\(\s*["']([a-z0-9_]+)["']/gu
      : /\.from\(\s*["']([a-z0-9_]+)["']/gu;
  const browser = kind === 'ts' && isBrowserModule(text);
  for (const match of text.matchAll(pattern)) {
    const name = match[1];
    if (!moved.has(name)) continue;
    const before = text.slice(
      Math.max(0, match.index - LOOKBEHIND),
      match.index
    );
    let reason = null;
    if (kind === 'dart') reason = 'Flutter must call an /api/v1 route';
    else if (browser) reason = 'browser modules must call a server route';
    else if (
      kind === 'python' &&
      !/schema\(\s*["']private["']\s*\)\s*$/u.test(before.replace(/\s+/gu, ''))
    )
      reason = 'use schema("private")';
    else if (
      kind === 'ts' &&
      !/\.schema\(\s*["']private["']\s*\)\s*$/u.test(
        before.replace(/\s+/gu, '')
      )
    )
      reason = "use .schema('private') on an authorized admin client";
    if (reason)
      findings.push({
        file,
        line: lineOf(text, match.index),
        kind: 'DIRECT ACCESS',
        message: `${name} is private: ${reason}`,
      });
  }
  return findings;
}

function scanCallers(repoRoot, moved) {
  if (moved.size === 0) return [];
  const targets = [];
  for (const root of sourceRoots(repoRoot))
    for (const file of walk(root, isSource)) targets.push([file, 'ts']);
  for (const file of walk(path.join(repoRoot, 'apps/mobile/lib'), (n) =>
    n.endsWith('.dart')
  ))
    targets.push([file, 'dart']);
  for (const file of walk(
    path.join(repoRoot, 'apps/discord'),
    (n) => n.endsWith('.py') && !n.startsWith('test_')
  ))
    targets.push([file, 'python']);
  const findings = [];
  for (const [file, kind] of targets) {
    const text = fs.readFileSync(file, 'utf8');
    findings.push(
      ...scanText({ file: path.relative(repoRoot, file), text, kind, moved })
    );
  }
  return findings;
}

module.exports = { isBrowserModule, scanCallers, scanText };

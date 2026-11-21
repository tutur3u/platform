// Name-list parsing for scripts/ci/web-cf-env-sync.mjs.
//
// A list is either a family inventory (apps/web/cloudflare/opennext/*.env.json:
// names grouped by section, plus `unset` names that must stay off the Worker)
// or a plain list (a JSON array, or one name per line with `#` comments).
// Inventory entries are short patterns written for people, for example
//   "NEXT_PUBLIC_<APP>_APP_URL for CHAT, CMS"
//   "<APP>_APP_URL and TUTURUUU_<APP>_BASE_URL for the app list above"
//   "API_PROXY_*_LIMIT_{MINUTE,HOUR,DAY}"
//   "NATIVE_INTEGRITY_* (Calendar settings, challenge and enrollment)"
// and expand to exact names or `*` globs matched against Vercel keys.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Inventory sections synced to the Worker. buildMetadata is set by the build. */
export const SYNCED_SECTIONS = Object.freeze([
  'requiredSecrets',
  'paritySecrets',
  'publicBuildAndRuntime',
  'runtimeConfig',
]);

// `*` alone selects every production key of the project.
const NAME_PATTERN = /^(?:\*|[A-Z][A-Z0-9_*]*)$/;

function expandBraces(pattern) {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match) return [pattern];
  return match[1]
    .split(',')
    .map((part) => part.trim())
    .flatMap((part) => expandBraces(pattern.replace(match[0], () => part)));
}

/**
 * Expands one inventory entry into exact names and globs. `context.apps`
 * remembers the last `for A, B` list so "the app list above" can refer to it.
 */
export function expandEntry(entry, context = { apps: null }) {
  assert.ok(typeof entry === 'string', 'name entry must be a string');
  let text = entry.replace(/\s*\([^)]*\)\s*$/, '').trim();
  let apps = null;
  const forClause = text.match(/^(.*?)\s+for\s+(.+)$/);
  if (forClause) {
    text = forClause[1].trim();
    if (/^the app list above$/i.test(forClause[2].trim())) {
      assert.ok(
        context.apps,
        `"${entry}" refers to an app list that is absent`
      );
      apps = context.apps;
    } else {
      apps = forClause[2]
        .split(',')
        .map((app) => app.trim())
        .filter(Boolean);
      context.apps = apps;
    }
  }
  const names = [];
  for (const part of text.split(/\s+and\s+/)) {
    const variants = part.includes('<APP>')
      ? (assert.ok(apps, `"${entry}" uses <APP> without a for list`),
        apps.map((app) => part.replaceAll('<APP>', app)))
      : [part];
    for (const variant of variants) names.push(...expandBraces(variant.trim()));
  }
  for (const name of names)
    assert.ok(NAME_PATTERN.test(name), `unparseable name entry "${entry}"`);
  return names;
}

/**
 * Reads one name list. Returns `{ patterns, excluded }`: patterns keep their
 * source section, excluded names come from the inventory `unset` map.
 */
export function parseNameList(text, label = 'name list') {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    const patterns = trimmed
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trim())
      .filter(Boolean)
      .flatMap((line) => expandEntry(line))
      .map((pattern) => ({ pattern, section: 'list' }));
    return { patterns, excluded: new Set() };
  }
  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) {
    const context = { apps: null };
    return {
      patterns: parsed
        .flatMap((entry) => expandEntry(entry, context))
        .map((pattern) => ({ pattern, section: 'list' })),
      excluded: new Set(),
    };
  }
  assert.ok(parsed && typeof parsed === 'object', `${label} is not an object`);
  const context = { apps: null };
  const patterns = [];
  for (const section of SYNCED_SECTIONS) {
    const entries = parsed[section] ?? [];
    assert.ok(Array.isArray(entries), `${label} ${section} is not a list`);
    for (const entry of entries)
      for (const pattern of expandEntry(entry, context))
        patterns.push({ pattern, section });
  }
  const unset = parsed.unset ?? {};
  assert.ok(
    unset && typeof unset === 'object' && !Array.isArray(unset),
    `${label} unset is not a map`
  );
  for (const name of Object.keys(unset))
    assert.ok(NAME_PATTERN.test(name), `${label} unset has an invalid name`);
  return { patterns, excluded: new Set(Object.keys(unset)) };
}

/** Merges several lists; an `unset` name in any list wins over a pattern. */
export function readNameLists(
  paths,
  read = (path) => readFileSync(path, 'utf8')
) {
  assert.ok(paths.length > 0, 'pass at least one --names list');
  const patterns = new Map();
  const excluded = new Set();
  for (const path of paths) {
    const list = parseNameList(read(path), path);
    for (const { pattern, section } of list.patterns)
      if (!patterns.has(pattern)) patterns.set(pattern, section);
    for (const name of list.excluded) excluded.add(name);
  }
  return {
    patterns: [...patterns].map(([pattern, section]) => ({ pattern, section })),
    excluded,
  };
}

export function globToRegExp(pattern) {
  return new RegExp(`^${pattern.replaceAll('*', '[A-Z0-9_]*')}$`);
}

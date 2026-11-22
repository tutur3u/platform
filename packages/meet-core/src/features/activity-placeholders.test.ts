import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import messages from '../../../../apps/meet/messages/en.json';
import vi from '../../../../apps/meet/messages/vi.json';

// Every text field in the activity panels carries a placeholder with a value,
// and a translated one names a key the English and Vietnamese bundles define. The panels are
// the tools, the polls and quiz components, the forms launcher, the classroom
// tools and the document tabs. Choice controls (radio, checkbox), native
// selects that always hold a value, and a field that spreads shared props
// (which include one) are not text fields.
const FEATURES = import.meta.dirname;
const ROOTS = [
  join(FEATURES, 'call/tools'),
  join(FEATURES, 'call/components/forms'),
  join(FEATURES, 'classroom-tools'),
];
const FILES = [
  join(FEATURES, 'call/components/polls-panel.tsx'),
  join(FEATURES, 'call/components/quiz-arena-builder.tsx'),
  join(FEATURES, 'call/components/document-tabs.tsx'),
  join(FEATURES, 'call/components/quiz-arena-host-controls.tsx'),
  join(FEATURES, 'call/components/quiz-arena-play.tsx'),
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

function tagAt(source: string, start: number) {
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === '{') depth++;
    else if (char === '}') depth--;
    else if (char === '>' && depth === 0 && source[index - 1] !== '=')
      return source.slice(start, index + 1);
  }
  return source.slice(start);
}

function lookup(path: string, bundle: unknown = messages): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      bundle
    );
}

/** A key both languages define as text. */
const defined = (path: string) =>
  typeof lookup(path) === 'string' && typeof lookup(path, vi) === 'string';

/** What the placeholder expression asks for: a literal or translation keys. */
function placeholderOf(tag: string) {
  const literal = /placeholder="([^"]+)"/.exec(tag);
  if (literal) return { literal: literal[1] as string, keys: [] as string[] };
  const expression = /placeholder=\{([\s\S]*?)\}(?=\s|\/?>)/.exec(tag)?.[1];
  if (!expression?.trim()) return null;
  return {
    literal: null,
    // Conditions such as `mode === 'manual'` are not keys.
    keys: [
      ...expression
        .replace(/\w+\s*[!=]==?\s*'[^']*'/g, '')
        .matchAll(/'([A-Za-z_.]+)'/g),
    ].map((m) => m[1] ?? ''),
    copy: [...expression.matchAll(/copy\.(\w+)/g)].map((m) => m[1] ?? ''),
  };
}

it('gives every text field a valued placeholder that its bundle defines', () => {
  const missing: string[] = [];
  const unresolved: string[] = [];
  const copySource = readFileSync(
    join(FEATURES, 'call/components/forms/meet-forms-copy.ts'),
    'utf8'
  );
  for (const file of [...ROOTS.flatMap(sources), ...FILES]) {
    const source = readFileSync(file, 'utf8');
    const where = (index: number) =>
      `${file.split('/features/')[1]}:${source.slice(0, index).split('\n').length}`;
    for (const match of source.matchAll(
      /<(Input|Textarea|input|textarea)\b/g
    )) {
      const tag = tagAt(source, match.index);
      if (/['"](checkbox|radio|file|hidden|range)['"]/.test(tag)) continue;
      if (/\{\.\.\.field\}/.test(tag)) continue;
      const found = placeholderOf(tag);
      if (!found) {
        missing.push(where(match.index));
        continue;
      }
      const namespaces = [
        ...source.matchAll(/useTranslations\(\s*'([^']*)'/g),
      ].map((m) => m[1] ?? '');
      for (const key of found.keys) {
        const candidates = [key, ...namespaces.map((ns) => `${ns}.${key}`)];
        if (!candidates.some(defined))
          unresolved.push(`${where(match.index)} ${key}`);
      }
      for (const name of found.copy ?? []) {
        const key = new RegExp(`${name}: t\\('(\\w+)'\\)`).exec(
          copySource
        )?.[1];
        if (!key || !defined(`meet.call.forms.${key}`))
          unresolved.push(`${where(match.index)} copy.${name}`);
      }
    }
  }
  expect({ missing, unresolved }).toEqual({ missing: [], unresolved: [] });
});

it('does not repeat a field label as its placeholder', () => {
  const repeats: string[] = [];
  for (const file of [...ROOTS.flatMap(sources), ...FILES]) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /<(Input|Textarea|input|textarea)\b/g
    )) {
      const tag = tagAt(source, match.index);
      const label = /aria-label=\{([^}]*)\}/.exec(tag)?.[1]?.trim();
      const placeholder = /placeholder=\{([^}]*)\}/.exec(tag)?.[1]?.trim();
      if (label && placeholder && label === placeholder)
        repeats.push(
          `${file.split('/features/')[1]}:${source.slice(0, match.index).split('\n').length}`
        );
    }
  }
  expect(repeats).toEqual([]);
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// Text-like fields in the activity panels carry a placeholder. Choice
// controls (radio, checkbox), native selects that always hold a value, and a
// field that spreads shared props (which include one) are not text fields.
const ROOTS = [
  join(import.meta.dirname),
  join(import.meta.dirname, '../components/forms'),
  join(import.meta.dirname, '../../classroom-tools'),
];
const FILES = [
  join(import.meta.dirname, '../components/polls-panel.tsx'),
  join(import.meta.dirname, '../components/quiz-arena-builder.tsx'),
  join(import.meta.dirname, '../components/document-tabs.tsx'),
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

it('gives every text input and textarea in the activity panels a placeholder', () => {
  const missing: string[] = [];
  for (const file of [...ROOTS.flatMap(sources), ...FILES]) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /<(Input|Textarea|input|textarea)\b/g
    )) {
      const tag = tagAt(source, match.index);
      if (/['"](checkbox|radio|file|hidden|range)['"]/.test(tag)) continue;
      if (/placeholder|\{\.\.\.field\}/.test(tag)) continue;
      const line = source.slice(0, match.index).split('\n').length;
      missing.push(`${file.split('/features/')[1]}:${line}`);
    }
  }
  expect(missing).toEqual([]);
});

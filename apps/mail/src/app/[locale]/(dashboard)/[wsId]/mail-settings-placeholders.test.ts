import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Field types that show no text and so take no placeholder. */
const EXEMPT_INPUT_TYPES = new Set([
  'checkbox',
  'color',
  'file',
  'hidden',
  'radio',
]);

const settingsFiles = readdirSync(__dirname).filter(
  (file) =>
    /^mail-.*settings.*\.tsx$/.test(file) || file === 'mail-settings-dialog.tsx'
);

/** Every Input, Textarea and SelectValue element without a placeholder. */
function fieldsWithoutPlaceholder(source: string) {
  const missing: string[] = [];
  for (const match of source.matchAll(/<(Input|Textarea|SelectValue)\b/g)) {
    const start = match.index ?? 0;
    const end = source.indexOf('/>', start);
    const tag = source.slice(start, end === -1 ? undefined : end);
    const type = /\btype="([a-z]+)"/.exec(tag)?.[1];
    if (type && EXEMPT_INPUT_TYPES.has(type)) continue;
    if (!/\bplaceholder=/.test(tag)) {
      const line = source.slice(0, start).split('\n').length;
      missing.push(`${match[1]} at line ${line}`);
    }
  }
  return missing;
}

describe('Mail settings fields', () => {
  it('scans the settings panes', () => {
    expect(settingsFiles).toContain('mail-settings-dialog.tsx');
    expect(settingsFiles.length).toBeGreaterThan(5);
  });

  it.each(settingsFiles)('%s gives every text field a placeholder', (file) => {
    const source = readFileSync(join(__dirname, file), 'utf8');
    expect(fieldsWithoutPlaceholder(source)).toEqual([]);
  });
});

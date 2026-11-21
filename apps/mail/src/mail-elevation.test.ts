import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = __dirname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/u.test(entry.name) && !/\.test\./u.test(entry.name)
      ? [path]
      : [];
  });
}

describe('Mail elevation', () => {
  it('casts shadows only from the shared elevation scale', () => {
    const offenders = sources(root).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      // Raw Tailwind shadow sizes or foreground-tinted shadows (a glow in dark).
      const matches = source.match(
        /(?<![\w-])shadow-(?:sm|md|lg|xl|2xl|foreground\b[\w/]*)(?![\w-])|(?<![\w:-])shadow(?=["'\s])/gu
      );
      return matches ? [`${relative(root, file)}: ${matches.join(', ')}`] : [];
    });
    expect(offenders).toEqual([]);
  });

  it('builds the message toolbar from the shared floating bar', () => {
    const source = readFileSync(
      join(root, 'app/[locale]/(dashboard)/[wsId]/thread-detail.tsx'),
      'utf8'
    );
    expect(source).toContain("from '@tuturuuu/ui/floating-bar'");
    expect(source).not.toContain('role="toolbar"');
    expect(source).not.toMatch(/rounded-2xl bg-background\/95/u);
  });
});

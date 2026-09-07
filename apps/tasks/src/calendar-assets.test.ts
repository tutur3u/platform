// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const calendarSources = [
  'packages/ui/src/components/ui/calendar-app',
  'packages/ui/src/components/ui/legacy/calendar',
];

function referencedAssets() {
  const assets = new Set<string>();
  for (const source of calendarSources) {
    const directory = join(root, source);
    for (const file of readdirSync(directory, {
      recursive: true,
      encoding: 'utf8',
    })) {
      if (!file.endsWith('.tsx') || file.includes('.test.')) continue;
      const contents = readFileSync(join(directory, file), 'utf8');
      for (const match of contents.matchAll(
        /['"](\/(?:media\/[^'"]+|icon-512x512\.png))['"]/g
      )) {
        assets.add(match[1]!);
      }
    }
  }
  return [...assets];
}

describe('shared calendar public assets', () => {
  it.each(['tasks', 'calendar'])(
    '%s serves every referenced local asset',
    (app) => {
      const assets = referencedAssets();
      expect(assets.length).toBeGreaterThan(0);
      for (const asset of assets) {
        const path = join(root, 'apps', app, 'public', asset);
        expect(existsSync(path), `${app} is missing ${asset}`).toBe(true);
        expect(
          statSync(path).size,
          `${app} has an empty ${asset}`
        ).toBeGreaterThan(0);
      }
    }
  );
});

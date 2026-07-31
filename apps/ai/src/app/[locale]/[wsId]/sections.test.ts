import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function pageExists(section: string) {
  return existsSync(
    fileURLToPath(new URL(`./${section}/page.tsx`, import.meta.url))
  );
}

function navigationSource() {
  return readFileSync(new URL('./navigation.tsx', import.meta.url), 'utf8');
}

const SECTIONS = [
  'agents',
  'api-keys',
  'credits',
  'datasets',
  'developer-docs',
  'model-policy',
  'playground',
  'prompts',
  'runs',
  'usage',
];

describe('AI Studio section routing', () => {
  it('gives every navigable section its own route', () => {
    for (const section of SECTIONS) {
      expect(pageExists(section), section).toBe(true);
    }
  });

  it('links every section it renders in the sidebar', () => {
    const navigation = navigationSource();

    for (const section of SECTIONS) {
      expect(navigation, section).toContain(`href('${section}')`);
    }
  });

  it('drops the sections that had no backing implementation', () => {
    const navigation = navigationSource();

    for (const section of ['evaluations', 'experiments']) {
      expect(pageExists(section), section).toBe(false);
      expect(navigation, section).not.toContain(`href('${section}')`);
    }
  });

  it('keeps legacy /logs links working without duplicating the runs view', () => {
    const navigation = navigationSource();
    const logs = readFileSync(
      new URL('./logs/page.tsx', import.meta.url),
      'utf8'
    );

    expect(navigation).not.toContain("href('logs')");
    expect(logs).toContain(`permanentRedirect(\`/\${wsId}/runs\`)`);
  });

  it('resolves the section catch-all into static routes', () => {
    expect(
      existsSync(fileURLToPath(new URL('./[section]', import.meta.url)))
    ).toBe(false);
  });
});

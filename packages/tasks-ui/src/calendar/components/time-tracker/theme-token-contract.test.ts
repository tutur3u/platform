import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPONENT_FILES = [
  'components/active-session-card.tsx',
  'components/new-session-support.tsx',
  'components/session-card.tsx',
] as const;

const FIXED_CHROMATIC_TOKEN =
  /(?:bg|text|border|ring|from|via|to|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/;

async function readComponent(relativePath: (typeof COMPONENT_FILES)[number]) {
  return readFile(
    resolve(
      process.cwd(),
      'src/calendar/components/time-tracker',
      relativePath
    ),
    'utf8'
  );
}

describe('time tracker theme token contract', () => {
  it.each(COMPONENT_FILES)(
    'keeps %s free of fixed chromatic palette classes',
    async (relativePath) => {
      const source = await readComponent(relativePath);

      expect(source).not.toMatch(FIXED_CHROMATIC_TOKEN);
    }
  );

  it('uses dynamic theme colors for running and completed session states', async () => {
    const [activeSession, completion, session] = await Promise.all(
      COMPONENT_FILES.map(readComponent)
    );

    expect(activeSession).toContain('from-dynamic-red/10');
    expect(activeSession).toContain('text-dynamic-red');
    expect(completion).toContain('text-dynamic-green');
    expect(session).toContain('bg-dynamic-green/10');
    expect(session).toContain('ring-dynamic-green');
  });
});

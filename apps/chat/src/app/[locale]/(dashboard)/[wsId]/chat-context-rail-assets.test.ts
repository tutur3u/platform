import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const chatContextRailSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/chat-context-rail.tsx'
  ),
  'utf8'
);

describe('chat context rail assets', () => {
  it('uses the same-origin Tuturuuu logo for the root workspace rail item', () => {
    expect(chatContextRailSource).toContain('TUTURUUU_LOCAL_LOGO_URL');
    expect(chatContextRailSource).not.toContain('TUTURUUU_LOGO_URL');
    expect(chatContextRailSource).not.toContain('TUTURUUU_REMOTE_LOGO_URL');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Contacts workspace layout', () => {
  it('repairs the satellite actor profile link for every joined workspace route', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/[locale]/[wsId]/layout.tsx'),
      'utf8'
    );

    expect(source).toContain(
      "import { getContactsWorkspaceAccess } from '@/lib/workspace';"
    );
    expect(source).toMatch(
      /if \(!workspace\.joined\) redirect\('\/dashboard'\);[\s\S]*getContactsWorkspaceAccess\(workspace\.id\)/u
    );
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const whitelistPages = [
  'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/ai/whitelist/emails/page.tsx',
  'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/ai/whitelist/domains/page.tsx',
];

describe('AI whitelist request rendering', () => {
  it.each(whitelistPages)(
    'opts %s into request-time rendering before reading authenticated data',
    (page) => {
      const source = readFileSync(resolve(repoRoot, page), 'utf8');

      expect(source).toContain("import { connection } from 'next/server';");
      expect(source).toMatch(
        /export default async function WhitelistPage[\s\S]*?await connection\(\);/
      );
    }
  );
});

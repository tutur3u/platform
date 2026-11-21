import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const infrastructureRoot = resolve(import.meta.dirname, '../..');

const privateSchemaRepositories = [
  'src/lib/ai-whitelist/domain-repository.ts',
  'src/lib/ai-whitelist/email-repository.ts',
  'src/lib/infrastructure/timezones.ts',
];

describe('Infrastructure private-schema runtime', () => {
  it('uses the configured Supabase admin client for private tables', () => {
    for (const relativePath of privateSchemaRepositories) {
      const source = readFileSync(
        resolve(infrastructureRoot, relativePath),
        'utf8'
      );

      expect(source).toContain('createAdminClient');
      expect(source).toContain(".schema('private')");
      expect(source).not.toContain('getPlatformSql');
    }
  });

  it('does not require a separate direct database connection helper', () => {
    expect(
      existsSync(
        resolve(infrastructureRoot, 'src/lib/database/platform-sql.ts')
      )
    ).toBe(false);
  });
});

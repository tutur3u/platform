// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_DOMAIN_MAP } from './internal-domains';

const migrationsDir = join(
  __dirname,
  '../../../apps/database/supabase/migrations'
);

function latestSqlInternalAppNames() {
  const definition = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .reverse()
    .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
    .map((sql) =>
      sql.match(
        /function private\.cross_app_internal_app_names\(\)[\s\S]*?array\[([\s\S]*?)\]::text\[\]/iu
      )
    )
    .find((match) => match !== null);

  if (!definition?.[1]) {
    throw new Error('private.cross_app_internal_app_names() not found');
  }

  return [...definition[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]);
}

describe('cross-app token app allowlist', () => {
  it('matches the internal app domains, so every verifier can be targeted', () => {
    const domainNames = [...new Set(APP_DOMAIN_MAP.map(({ name }) => name))];

    expect([...latestSqlInternalAppNames()].sort()).toEqual(domainNames.sort());
  });
});

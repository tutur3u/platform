import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { test } from 'node:test';
import { readJsonc } from './gateway-deploy-config.mjs';
import { FAMILIES_FILE } from './shared-secret-targets.mjs';

test('every checked-in Web family Worker config disables the Supabase coordination token fallback', () => {
  const directory = new URL(
    `../../${dirname(FAMILIES_FILE)}/`,
    import.meta.url
  );
  const files = readdirSync(directory).filter((name) =>
    name.endsWith('.jsonc')
  );
  assert.ok(files.length > 0, 'no family Worker configs found');
  for (const name of files) {
    const config = readJsonc(new URL(name, directory));
    assert.equal(
      config.vars?.APP_COORDINATION_TOKEN_DISABLE_SUPABASE_FALLBACK,
      '1',
      name
    );
  }
});

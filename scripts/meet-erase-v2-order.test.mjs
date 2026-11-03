import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = '20261103120000_meet_erase_settings_and_holds';
test('V2 uses the reviewed timestamp between V4 and V10', () => {
  assert.ok(existsSync(`apps/database/supabase/migrations/${migration}.sql`));
  assert.ok(
    !existsSync(
      'apps/database/supabase/migrations/20261103110000_meet_erase_settings_and_holds.sql'
    )
  );
  assert.ok('20261103112400' < migration && migration < '20261103130000');
});
test('V2 rollback explicitly forbids running after V10', () => {
  assert.match(
    readFileSync(`apps/database/rollbacks/${migration}.rollback.sql`, 'utf8'),
    /FORBIDDEN after V10/
  );
});

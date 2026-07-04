import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '../../..');
const seedSqlPath = path.join(rootDir, 'apps/database/supabase/seed.sql');

test('seed SQL does not build random intervals through text concatenation', () => {
  const sql = fs.readFileSync(seedSqlPath, 'utf8');

  assert.doesNotMatch(
    sql,
    /random\s*\(\s*\)\s*\*[\s\S]{0,80}\|\|\s*'[^']+'\s*\)\s*::\s*interval/iu,
    'Use interval arithmetic such as random() * interval instead of text-concatenated intervals, which can emit scientific notation.'
  );
});

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

function migration(suffix) {
  const dir = path.join(root, 'supabase/migrations');
  const name = readdirSync(dir).find((file) => file.endsWith(suffix));
  assert.ok(name, `missing migration ending ${suffix}`);
  return readFileSync(path.join(dir, name), 'utf8');
}

function sliceFunction(sql, name) {
  const start = sql.indexOf(`CREATE FUNCTION private.${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = sql.indexOf('\nCREATE FUNCTION ', start + 1);
  return sql.slice(start, next === -1 ? undefined : next);
}

test('item and byte caps count only live rows', () => {
  const sql = migration('_password_vault_operations.sql');
  const caps = sql.match(
    /SELECT count\(\*\) FROM private\.password_vault_items WHERE[^;]+/g
  );
  assert.ok(caps && caps.length >= 2, 'expected both new-item cap counts');
  for (const query of caps) {
    if (query.includes('>= 1000')) {
      assert.match(query, /deleted_at IS NULL/);
    }
  }
  assert.match(
    sql,
    /FROM private\.password_vault_items WHERE ws_id = p_ws AND vault_id = p_vault AND deleted_at IS NULL\s+HAVING sum\(ciphertext_bytes\) > 104857600/
  );
});

test('workspace FOR NO KEY UPDATE is taken only for writes', () => {
  const sql = migration('_password_vault_operations.sql');
  const execute = sliceFunction(sql, 'password_vault_execute');
  const list = sliceFunction(sql, 'password_vault_list');
  assert.match(
    execute,
    /IF mutates THEN\s+PERFORM 1 FROM public\.workspaces WHERE id = p_ws FOR NO KEY UPDATE;/
  );
  assert.equal(
    [...execute.matchAll(/FOR NO KEY UPDATE/g)].length,
    1,
    'execute takes the exclusive workspace lock once'
  );
  assert.doesNotMatch(list, /FOR NO KEY UPDATE/);
});

test('lifecycle outbox is bounded and a foreign backlog cannot block a workspace', () => {
  const sql = migration('_password_vault_lifecycle.sql');
  const enqueue = sliceFunction(sql, 'password_vault_enqueue_lifecycle');
  const clean = sliceFunction(sql, 'password_vault_require_lifecycle_clean');
  const retry = sliceFunction(sql, 'password_vault_retry_lifecycle');
  assert.match(enqueue, /IF NOT relevant THEN RETURN; END IF;/);
  assert.match(clean, /password_vault_apply_lifecycle/);
  assert.match(clean, /j\.ws_id = p_ws/);
  assert.match(retry, /pendingCap/);
  assert.match(retry, /'alert'/);
  assert.match(retry, /interval '24 hours'/);
  assert.match(retry, /PARTITION BY COALESCE/);
  assert.match(
    sql,
    /password_vault_lifecycle_pending_ws_idx[\s\S]*WHERE completed_at IS NULL/
  );
});

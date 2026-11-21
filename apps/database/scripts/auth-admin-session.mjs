import assert from 'node:assert/strict';

const AUTH_USER_SQL = /(?:insert into|delete from) auth\.users\b[^;]*;/giu;

/** Session role GoTrue uses. The platform-role guard reads that role, not the definer. */
export function asAuthAdmin(statement) {
  return `set role supabase_auth_admin;\n${statement.trim()}\nreset role;`;
}

export function assertAuthUsersUseAuthAdmin(source, label) {
  const statements = [...source.matchAll(AUTH_USER_SQL)];
  assert.ok(
    statements.length > 0,
    `${label} must create or delete auth users under test`
  );
  for (const match of statements) {
    const start = match.index ?? 0;
    const before = source.slice(Math.max(0, start - 160), start);
    const preview = match[0].replace(/\s+/gu, ' ').slice(0, 48);
    assert.match(
      before,
      /set role supabase_auth_admin;\s*$/u,
      `${label} must switch to supabase_auth_admin before ${preview}`
    );
    const after = source.slice(
      start + match[0].length,
      start + match[0].length + 40
    );
    assert.match(
      after,
      /^\s*reset role;/u,
      `${label} must reset the role immediately after ${preview}`
    );
  }
}

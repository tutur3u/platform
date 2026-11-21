import assert from 'node:assert/strict';

const AUTH_USER_SQL = /(?:insert into|delete from) auth\.users\b[^;]*;/giu;

/**
 * Session role GoTrue uses. The platform-role guard reads that role, not the definer.
 * Skip the switch when this session is already admitted or cannot assume the role:
 * local pgTAP runs as non-superuser postgres, and an unconditional SET ROLE aborts it.
 */
export const ASSUME_AUTH_WRITER_SQL = `do $assume$
begin
  if coalesce(nullif(current_setting('role'), 'none'), session_user::text)
       in ('postgres', 'supabase_auth_admin') then
    return;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    return;
  end if;
  if pg_has_role(session_user, 'supabase_auth_admin', 'SET') then
    perform set_config('role', 'supabase_auth_admin', false);
  end if;
end
$assume$;`;

/**
 * public.users rekey cascades into platform_user_roles. supabase_auth_admin is
 * admitted by the guard but cannot update public.users. postgres is admitted and
 * both the local runner and the CI superuser can assume it.
 */
export const ASSUME_PLATFORM_USER_WRITER_SQL = `do $assume$
begin
  if coalesce(nullif(current_setting('role'), 'none'), session_user::text) = 'postgres' then
    return;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    return;
  end if;
  if pg_has_role(session_user, 'postgres', 'SET') then
    perform set_config('role', 'postgres', false);
  end if;
end
$assume$;`;

export function assumeAuthWriterSql(statement) {
  return `${ASSUME_AUTH_WRITER_SQL}\n${statement.trim()}\nreset role;`;
}

function assumeKind(source, start, roleName) {
  const before = source.slice(Math.max(0, start - 900), start);
  if (/assumeAuthWriterSql\(\s*[`'"]?\s*$/u.test(before)) return 'helper';
  if (!/\$assume\$;\s*$/u.test(before)) return null;
  const block = before
    .slice(before.lastIndexOf('do $assume$'))
    .replace(/\s*$/u, '');
  if (block !== assumeSql(roleName)) return null;
  return 'sql';
}

function assumeSql(roleName) {
  if (roleName === 'supabase_auth_admin') return ASSUME_AUTH_WRITER_SQL;
  if (roleName === 'postgres') return ASSUME_PLATFORM_USER_WRITER_SQL;
  throw new Error(`unknown admitted role ${roleName}`);
}

export function assertAuthUsersUseAuthAdmin(source, label) {
  const statements = [...source.matchAll(AUTH_USER_SQL)];
  assert.ok(
    statements.length > 0,
    `${label} must create or delete auth users under test`
  );
  for (const match of statements) {
    const start = match.index ?? 0;
    const preview = match[0].replace(/\s+/gu, ' ').slice(0, 48);
    const kind = assumeKind(source, start, 'supabase_auth_admin');
    assert.ok(
      kind,
      `${label} must guard supabase_auth_admin before ${preview}`
    );
    if (kind === 'sql') {
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
}

export function assertPlatformUserRekeyUsesAdmittedRole(source, label) {
  const rekeys = [
    'update public.users set id=pg_temp.fid(92704) where id=pg_temp.fid(92701)',
    'delete from public.users where id=pg_temp.fid(92704)',
  ];
  assert.equal(
    source.split(rekeys[0]).length - 1,
    3,
    `${label} must keep the three creator rekey statements`
  );
  assert.equal(
    source.split(rekeys[1]).length - 1,
    1,
    `${label} must keep the creator deletion`
  );
  for (const statement of rekeys) {
    let from = 0;
    while (from < source.length) {
      const start = source.indexOf(statement, from);
      if (start < 0) break;
      const before = source.slice(Math.max(0, start - 900), start);
      assert.match(
        before,
        /\$assume\$;\nselect (?:throws_ok|lives_ok)\(\$q\$\s*$/u,
        `${label} must admit postgres immediately before ${statement}`
      );
      const raw = before.slice(before.lastIndexOf('do $assume$'));
      const block = raw.slice(0, raw.indexOf('$assume$;') + '$assume$;'.length);
      assert.equal(block, ASSUME_PLATFORM_USER_WRITER_SQL);
      from = start + statement.length;
    }
  }
  assert.match(
    source,
    /reset role;\nset local search_path=public,extensions;\ndelete from public\.workspace_members where user_id=pg_temp\.fid\(92701\);/u,
    `${label} must delete memberships as the original role`
  );
  assert.match(
    source,
    /reset role;\nset local search_path=public,extensions;\n(?:--[^\n]*\n)?delete from public\.user_private_details where user_id=pg_temp\.fid\(92701\);/u,
    `${label} must delete private details as the original role`
  );
  assert.doesNotMatch(
    source,
    /\$assume\$;\nselect lives_ok\(\$q\$delete from public\.workspaces/u,
    `${label} must not switch roles for workspace cleanup`
  );
}

// pg_net's queue tables keep request headers (including the notification
// bearer) and send an HTTP request for every inserted row. The extension grants
// them to PUBLIC, anon and authenticated, and migrations cannot revoke those
// grants because supabase_admin owns the tables. These checks keep the schema
// unreachable from the API: see apps/docs/build/devops/public-schema-privatization.mdx.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const SUPABASE = path.join(ROOT, 'apps/database/supabase');
const EXPOSED_ROLES = /\b(public|anon|authenticated)\b/i;

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function statements(sql) {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// A GRANT (direct or default privileges) on schema net or a net.* object to an
// API role, a publication that names a net.* table, or a FOR ALL TABLES
// publication, which includes net. Dynamic SQL and grants through an
// intermediate role are out of scope.
function exposures(sql) {
  return statements(sql).filter((statement) => {
    if (
      /^(create|alter)\s+publication\b/i.test(statement) &&
      /\bfor\s+all\s+tables\b/i.test(statement)
    )
      return true;
    const touchesNet =
      /\bschema\s+"?net"?\b/i.test(statement) ||
      /\b"?net"?\s*\.\s*"?\w/i.test(statement);
    if (!touchesNet) return false;
    if (/^(grant|alter\s+default\s+privileges)\b/i.test(statement)) {
      const grantees = statement
        .split(/\bto\b/i)
        .slice(1)
        .join(' to ');
      return EXPOSED_ROLES.test(grantees);
    }
    return /^(create|alter)\s+publication\b/i.test(statement);
  });
}

function tomlArray(toml, key) {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*\\[([^\\]]*)\\]`, 'm').exec(
    toml
  );
  return match ? [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]) : [];
}

test('exposures flags API grants and publications on net objects', () => {
  assert.equal(exposures('grant usage on schema net to anon;').length, 1);
  assert.equal(
    exposures('GRANT SELECT ON TABLE "net"."_http_response" TO authenticated;')
      .length,
    1
  );
  assert.equal(
    exposures('grant insert on net.http_request_queue to public;').length,
    1
  );
  assert.equal(
    exposures(
      'alter publication supabase_realtime add table net._http_response;'
    ).length,
    1
  );
  assert.equal(
    exposures(
      'alter default privileges in schema net grant select on tables to anon;'
    ).length,
    1
  );
  assert.equal(exposures('create publication p for all tables;').length, 1);
});

test('exposures ignores comments, other roles and unrelated schemas', () => {
  assert.deepEqual(exposures('-- GRANT USAGE ON SCHEMA "net" TO "anon";'), []);
  assert.deepEqual(exposures('/* grant all on net.x to anon */ select 1;'), []);
  assert.deepEqual(exposures('grant usage on schema net to service_role;'), []);
  assert.deepEqual(exposures('grant select on public.network to anon;'), []);
  assert.deepEqual(
    exposures(
      'select net.http_post(url := $1) ; grant execute on function public.f() to anon;'
    ),
    []
  );
});

test('the API does not expose schema net', () => {
  const toml = fs.readFileSync(path.join(SUPABASE, 'config.toml'), 'utf8');
  for (const key of ['schemas', 'extra_search_path'])
    assert.ok(
      !tomlArray(toml, key).includes('net'),
      `config.toml [api] ${key} must not include net`
    );
});

test('no migration grants or publishes net objects to API roles', () => {
  const dir = path.join(SUPABASE, 'migrations');
  const found = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .flatMap((file) =>
      exposures(fs.readFileSync(path.join(dir, file), 'utf8')).map(
        (statement) => `${file}: ${statement.slice(0, 160)}`
      )
    );
  assert.deepEqual(found, []);
});

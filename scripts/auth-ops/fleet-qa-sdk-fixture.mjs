import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function installSyntheticSdk(copy, settings = {}) {
  const folder = join(copy.dir, 'verified/node_modules/@supabase/supabase-js');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await writeFile(
    join(copy.dir, 'verified/packages/supabase/package.json'),
    '{"type":"module"}',
    { mode: 0o600 }
  );
  await writeFile(
    join(folder, 'package.json'),
    '{"name":"@supabase/supabase-js","type":"module","exports":"./index.mjs"}',
    { mode: 0o600 }
  );
  await writeFile(
    join(copy.folder, 'fleet-qa-fixture.mjs'),
    await readFile(new URL('./fleet-qa-fixture.mjs', import.meta.url)),
    { mode: 0o600 }
  );
  const receipt = join(copy.dir, 'receipt.json');
  const trace = join(copy.dir, 'trace.json');
  const code = `
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fixture } from '../../../scripts/auth-ops/fleet-qa-fixture.mjs';
const settings = ${JSON.stringify(settings)};
const path = ${JSON.stringify(receipt)};
const trace = ${JSON.stringify(trace)};
const record = () => JSON.parse(readFileSync(path, 'utf8'));
const f = fixture({ cascadePersonal: Boolean(settings.cascadePersonal) });
const r = record();
if (process.argv.at(-1) === 'cleanup') {
  await f.helper.provision();
  for (const user of f.users) {
    user.app_metadata = { qa: 'd241', created_by: r.ack, qa_run_id: r.runId };
    user.user_metadata = user.app_metadata;
  }
  for (const shared of r.sharedRecords) {
    f.workspaces.push({ id: shared.id, creator_id: r.accounts[0].id, personal: false, name: 'QA D241 smoke', created_at: r.startedAt, ...settings.sharedOverride });
    f.memberships.push({ ws_id: shared.id, user_id: r.accounts[0].id });
  }
} else await f.store.reserve(r);
f.calls.length = 0;
const fetches = [];
globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  assert.equal(u.origin, 'https://abcdefghijklmnopqrst.supabase.co');
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal instanceof AbortSignal);
  fetches.push({ origin: u.origin, path: u.pathname, method: init.method });
  if (u.pathname === '/auth/v1/admin/users') {
    assert.equal(init.method, 'GET');
    assert.equal(u.searchParams.get('per_page'), '2');
    assert.equal(u.searchParams.get('page'), '1');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-service-credential');
    const email = u.searchParams.get('filter');
    assert.ok(['qa-d241h-a1@tuturuuu.com', 'qa-d241h-a2@tuturuuu.com'].includes(email));
    return new Response(JSON.stringify({ users: f.users.filter((u) => u.email === email) }));
  }
  return new Response('{}');
};
process.on('exit', () => writeFileSync(trace, JSON.stringify({ calls: f.calls, fetches, remainingUsers: f.users.length, remainingWorkspaces: f.workspaces.length, remainingMembers: f.memberships.length }), { mode: 0o600 }));
export function createClient(origin, secret, options) {
  assert.equal(secret, 'synthetic-service-credential');
  const send = (path, method) => options.global.fetch((settings.wrongOrigin ? 'https://outside.invalid' : origin) + path, { method });
  const admin = {};
  for (const [name, fn] of Object.entries(f.admin)) {
    admin[name] = async (...args) => {
      await send('/auth/v1/admin/' + name, name === 'deleteUser' ? 'DELETE' : name === 'createUser' || name === 'generateLink' ? 'POST' : 'GET');
      if (process.argv.at(-1) === 'execution') await f.store.save(record());
      return fn(...args);
    };
  }
  return {
    auth: { admin },
    from(table) {
      const q = f.client.from(table);
      const then = q.then;
      const remove = q.delete;
      let method = 'GET';
      q.delete = () => { method = 'DELETE'; return remove(); };
      q.then = (yes, no) => send('/rest/v1/' + table, method).then(() => then(yes, no), no);
      return q;
    },
  };
}
`;
  await writeFile(join(folder, 'index.mjs'), code, { mode: 0o600 });
  return { receipt, trace };
}

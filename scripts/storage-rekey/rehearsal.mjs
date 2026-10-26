#!/usr/bin/env node
// STAGING-ONLY rehearsal fixtures for the storage re-key tool.
//
//   SUPABASE_ACCESS_TOKEN_FILE=<mode-600 file> node scripts/storage-rekey/rehearsal.mjs \
//     <seed|seed-vault|verify|verify-vault|cleanup> --project-ref <staging ref> --state <mode-600 json>
//
// `seed` creates synthetic objects (bytes are the literal text "synthetic") and
// referencing rows in a seeded test workspace; `verify` reports, using counts only,
// whether references moved; `cleanup` removes every synthetic row and object.
// It refuses any project whose name does not mark it as development/staging.

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { ROOT_WORKSPACE_ID } from './roots.mjs';
import {
  createSqlClient,
  fetchServiceRoleKey,
  lit,
  readSecretFile,
  storageAuthHeaders,
} from './supabase.mjs';

const TEST_WS = '00000000-0000-0000-0000-000000000002'; // seeded "Prototype General"

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { 'project-ref': { type: 'string' }, state: { type: 'string' } },
});
const [command] = positionals;
const projectRef = values['project-ref'];
// biome-ignore lint/suspicious/noUndeclaredEnvVars: direct operator script, outside cached Turbo tasks.
const accessToken = readSecretFile(process.env.SUPABASE_ACCESS_TOKEN_FILE);

const project = await (
  await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
).json();
if (!/development|staging/i.test(project?.name ?? '')) {
  throw new Error('Refusing: rehearsal fixtures are staging-only');
}

const sql = createSqlClient({ projectRef, accessToken });
const serviceKey = await fetchServiceRoleKey({ projectRef, accessToken });
const base = `https://${projectRef}.supabase.co/storage/v1`;
const headers = storageAuthHeaders(serviceKey);

async function upload(key, type) {
  const response = await fetch(
    `${base}/object/workspaces/${key.split('/').map(encodeURIComponent).join('/')}`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': type },
      body: 'synthetic',
    }
  );
  if (!response.ok) throw new Error(`upload_http_${response.status}`);
}

async function seed() {
  const [{ creator_id: user }] = await sql.read(
    `select creator_id from public.workspaces where id = ${lit(TEST_WS)}`
  );
  const s = {
    user,
    chat: randomUUID(),
    goneChat: randomUUID(),
    conv: randomUUID(),
    msg: randomUUID(),
    tag: randomUUID(),
  };
  const w = TEST_WS;
  s.keys = {
    aiA: `${w}/chats/ai/resources/${s.chat}/1712000000000_a.txt`,
    aiB: `${w}/chats/ai/resources/${s.chat}/1712000000001_b.txt`,
    aiGone: `${w}/chats/ai/resources/${s.goneChat}/1712000000002_c.txt`,
    native: `${w}/chats/${s.conv}/${randomUUID()}-d.txt`,
    nativeDeleted: `${w}/chats/${s.conv}/${randomUUID()}-e.txt`,
    mira: `${w}/mira/images/${randomUUID()}.png`,
    vault: `${ROOT_WORKSPACE_ID}/.tuturuuu/rehearsal-${s.tag}/file-${s.tag}.ciphertext.json`,
  };
  await sql.write(
    `insert into public.ai_chats (id, creator_id, title) values (${lit(s.chat)}, ${lit(user)}, 'rekey rehearsal')`
  );
  await sql.write(`insert into public.ai_chat_messages (chat_id, creator_id, role, content, metadata) values
    (${lit(s.chat)}, ${lit(user)}, 'USER', 'rehearsal', ${lit(JSON.stringify({ attachments: [{ storagePath: s.keys.aiA, id: `ai-file:${encodeURIComponent(s.keys.aiA)}` }] }))}::jsonb),
    (${lit(s.chat)}, ${lit(user)}, 'ASSISTANT', 'rehearsal', ${lit(JSON.stringify({ toolResults: [{ output: { storagePath: s.keys.aiB } }, { output: { storagePath: s.keys.mira, imageUrl: 'synthetic' } }] }))}::jsonb)`);
  await sql.write(
    `insert into private.chat_conversations (id, ws_id, type, created_by, title) values (${lit(s.conv)}, ${lit(w)}, 'group', ${lit(user)}, 'rekey rehearsal')`
  );
  await sql.write(
    `insert into private.chat_messages (id, conversation_id, sender_id, kind, content) values (${lit(s.msg)}, ${lit(s.conv)}, ${lit(user)}, 'user', 'rehearsal')`
  );
  for (const [key, deleted] of [
    [s.keys.native, false],
    [s.keys.nativeDeleted, true],
  ]) {
    await sql.write(`insert into private.chat_message_attachments (conversation_id, message_id, uploader_id, storage_path, full_path, filename, content_type, size_bytes, storage_ws_id, deleted_at)
      values (${lit(s.conv)}, ${lit(s.msg)}, ${lit(user)}, ${lit(key.slice(w.length + 1))}, ${lit(key)}, 'd.txt', 'text/plain', 9, ${lit(w)}, ${deleted ? 'now()' : 'null'})`);
  }
  for (const [name, key] of Object.entries(s.keys))
    await upload(key, name === 'mira' ? 'image/png' : 'text/plain');
  await sql.write(`update storage.objects set owner = ${lit(user)}, owner_id = ${lit(user)}
    where bucket_id = 'workspaces' and name in (${Object.values(s.keys).map(lit).join(', ')})`);
  fs.writeFileSync(values.state, JSON.stringify(s), { mode: 0o600 });
  console.log(
    JSON.stringify({ event: 'seeded', objects: Object.keys(s.keys).length })
  );
}

// Two vault versions sharing one artifact path, as SQL draft inheritance creates.
async function seedVault() {
  const s = JSON.parse(fs.readFileSync(values.state, 'utf8'));
  const [{ id: env }] = await sql.read(
    'select id from private.mobile_deployment_environments order by created_at limit 1'
  );
  s.vaultVersions = [randomUUID(), randomUUID()];
  s.vaultKey = `${ROOT_WORKSPACE_ID}/.tuturuuu/rehearsal-${s.tag}/vault-${s.tag}.ciphertext.json`;
  const rel = s.vaultKey.slice(ROOT_WORKSPACE_ID.length + 1);
  for (const [index, version] of s.vaultVersions.entries()) {
    await sql.write(`insert into private.mobile_deployment_versions (id, environment_id, version, status, data_key_ciphertext, inheritance_initialized)
      values (${lit(version)}, ${lit(env)}, ${990000 + Math.floor(Math.random() * 9000) * 2 + index}, 'archived', 'synthetic', true)`);
    await sql.write(`insert into private.mobile_deployment_file_artifacts (version_id, kind, storage_provider, storage_path, filename, content_type, ciphertext_sha256, plaintext_sha256, plaintext_size, ciphertext_size, validation_status)
      values (${lit(version)}, 'android_google_services_json', 'supabase', ${lit(rel)}, 'synthetic.json', 'application/json', 'synthetic', 'synthetic', 9, 9, 'valid')`);
  }
  await upload(s.vaultKey, 'application/json');
  fs.writeFileSync(values.state, JSON.stringify(s), { mode: 0o600 });
  console.log(JSON.stringify({ event: 'seeded_vault', versions: 2 }));
}

async function verifyVault() {
  const s = JSON.parse(fs.readFileSync(values.state, 'utf8'));
  const rel = s.vaultKey.slice(ROOT_WORKSPACE_ID.length + 1);
  const [row] = await sql.read(`select
    (select count(*) from private.mobile_deployment_file_artifacts where version_id in (${s.vaultVersions.map(lit).join(', ')}) and storage_path = ${lit(rel)})::int as artifacts_old_path,
    (select count(*) from private.mobile_deployment_file_artifacts f join storage.objects o on o.bucket_id = 'workspaces' and o.name = ${lit(`${ROOT_WORKSPACE_ID}/`)} || f.storage_path where f.version_id in (${s.vaultVersions.map(lit).join(', ')}))::int as artifacts_resolving,
    (select count(distinct storage_path) from private.mobile_deployment_file_artifacts where version_id in (${s.vaultVersions.map(lit).join(', ')}))::int as distinct_paths,
    (select count(*) from storage.objects where bucket_id = 'workspaces' and name = ${lit(s.vaultKey)})::int as old_key_present`);
  console.log(JSON.stringify({ event: 'verify_vault', ...row }));
}

async function verify() {
  const s = JSON.parse(fs.readFileSync(values.state, 'utf8'));
  const w = TEST_WS;
  const [row] = await sql.read(`select
    (select count(*) from storage.objects where bucket_id = 'workspaces' and name in (${Object.values(s.keys).map(lit).join(', ')}))::int as old_keys_present,
    (select count(*) from storage.objects where bucket_id = 'workspaces' and (name like ${lit(`${w}/chats/ai/resources/${s.chat}/%`)} or name like ${lit(`${w}/chats/${s.conv}/%`)} or name like ${lit(`${w}/mira/images/%`)} or name like ${lit(`${ROOT_WORKSPACE_ID}/.tuturuuu/rehearsal-${s.tag}/%`)}))::int as objects_now,
    (select count(*) from storage.objects where bucket_id = 'workspaces' and name like ${lit(`${w}/chats/ai/resources/${s.chat}/%`)} and owner = ${lit(s.user)})::int as ai_objects_owned_by_user,
    (select count(*) from public.ai_chat_messages m where m.chat_id = ${lit(s.chat)} and (${[s.keys.aiA, s.keys.aiB, s.keys.mira].map((k) => `strpos(m.metadata::text, to_jsonb(${lit(k)}::text)::text) > 0`).join(' or ')}))::int as messages_with_old_keys,
    (select count(*) from private.chat_message_attachments a where a.conversation_id = ${lit(s.conv)} and a.deleted_at is null and a.full_path = ${lit(s.keys.native)})::int as live_attachment_old_path,
    (select count(*) from private.chat_message_attachments a join storage.objects o on o.bucket_id = 'workspaces' and o.name = a.full_path where a.conversation_id = ${lit(s.conv)} and a.storage_path = substr(a.full_path, 38))::int as attachments_resolving`);
  console.log(JSON.stringify({ event: 'verify', ...row }));
}

async function cleanup() {
  const s = JSON.parse(fs.readFileSync(values.state, 'utf8'));
  const w = TEST_WS;
  const prefixes = [
    `${w}/chats/ai/resources/${s.chat}/`,
    `${w}/chats/ai/resources/${s.goneChat}/`,
    `${w}/chats/${s.conv}/`,
    `${ROOT_WORKSPACE_ID}/.tuturuuu/rehearsal-${s.tag}/`,
  ];
  const miraName = s.keys.mira.split('/').pop();
  const rows = await sql.read(
    `select name from storage.objects where bucket_id = 'workspaces' and (${prefixes.map((p) => `name like ${lit(`${p}%`)}`).join(' or ')} or (name like ${lit(`${w}/mira/images/%`)} and right(name, ${miraName.length}) = ${lit(miraName)}))`
  );
  if (rows.length) {
    const response = await fetch(`${base}/object/workspaces`, {
      method: 'DELETE',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: rows.map((r) => r.name) }),
    });
    if (!response.ok) throw new Error(`delete_http_${response.status}`);
  }
  if (s.vaultVersions) {
    await sql.write(
      `delete from private.mobile_deployment_file_artifacts where version_id in (${s.vaultVersions.map(lit).join(', ')})`
    );
    await sql.write(
      `delete from private.mobile_deployment_versions where id in (${s.vaultVersions.map(lit).join(', ')})`
    );
  }
  await sql.write(
    `delete from private.chat_conversations where id = ${lit(s.conv)}`
  ); // cascades messages/attachments
  await sql.write(
    `delete from public.ai_chat_messages where chat_id = ${lit(s.chat)}`
  );
  await sql.write(`delete from public.ai_chats where id = ${lit(s.chat)}`);
  const [left] = await sql.read(`select
    (select count(*) from storage.objects where bucket_id = 'workspaces' and (${prefixes.map((p) => `name like ${lit(`${p}%`)}`).join(' or ')}))::int as objects,
    (select count(*) from public.ai_chats where id = ${lit(s.chat)})::int as chats,
    (select count(*) from private.chat_conversations where id = ${lit(s.conv)})::int as conversations`);
  console.log(
    JSON.stringify({
      event: 'cleanup',
      removedObjects: rows.length,
      remaining: left,
    })
  );
}

const commands = {
  seed,
  'seed-vault': seedVault,
  verify,
  'verify-vault': verifyVault,
  cleanup,
};
if (!commands[command])
  throw new Error(
    'Usage: rehearsal.mjs <seed|seed-vault|verify|verify-vault|cleanup> --project-ref <ref> --state <file>'
  );
await commands[command]();

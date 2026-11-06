// Per-root selection, skip rules and reference rewrites for the re-key job.
// The inventory behind these rules is in apps/docs/build/devops/storage-signed-url-rekey.mdx.
//
// Every SQL string here is a single statement, so each reference update is one
// transaction. Selection is read-only metadata (storage.objects plus row
// existence checks); nothing reads object bytes.

import { lit } from './supabase.mjs';

const UUID_RE =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
export const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

const ACTIVE_USER = (expr) =>
  `exists (select 1 from auth.users u where u.id = ${expr} and u.deleted_at is null)`;

// `p` is string_to_array(name, '/'), so p[1] is the workspace id.
const ROOT_FILTERS = {
  chats: `lower(p[2]) = 'chats'`,
  'mira/images': `lower(p[2]) = 'mira' and lower(p[3]) = 'images'`,
  '.tuturuuu': `lower(p[2]) = '.tuturuuu'`,
};

// First matching rule wins; null means "re-key".
const SKIP_RULES = {
  chats: `case
    when o.owner is not null and not ${ACTIVE_USER('o.owner')} then 'owner_deleted'
    when p[2] <> 'chats' then 'unclassified_path'
    when p[3] = 'ai' and p[4] = 'resources' and p[5] = 'temp' then
      case when p[6] ~ '${UUID_RE}' and ${ACTIVE_USER('p[6]::uuid')} then null else 'owner_deleted' end
    when p[3] = 'ai' and p[4] = 'resources' and p[5] ~ '${UUID_RE}' then
      case when exists (select 1 from public.ai_chats c where c.id = p[5]::uuid) then null else 'chat_deleted' end
    when p[3] ~ '${UUID_RE}' and array_length(p, 1) = 4 then
      case
        when not exists (select 1 from private.chat_conversations c where c.id = p[3]::uuid) then 'chat_deleted'
        when exists (
          select 1 from private.chat_message_attachments a
          where a.conversation_id = p[3]::uuid and a.full_path = o.name and a.deleted_at is not null
        ) then 'attachment_deleted'
        else null
      end
    else 'unclassified_path'
  end`,
  'mira/images': `case
    when o.owner is not null and not ${ACTIVE_USER('o.owner')} then 'owner_deleted'
    when p[2] <> 'mira' or p[3] <> 'images' or array_length(p, 1) <> 4 then 'unclassified_path'
    else null
  end`,
  '.tuturuuu': `case
    when p[1] <> '${ROOT_WORKSPACE_ID}' or p[2] <> '.tuturuuu' then 'unclassified_path'
    else null
  end`,
};

export function selectionSql(root, { bucket, id = null, wsId = null }) {
  return `with o as (
    select id, name, owner, owner_id, updated_at, metadata, string_to_array(name, '/') as p
    from storage.objects
    where bucket_id = ${lit(bucket)}${id ? ` and id = ${lit(id)}` : ''}${
      wsId ? ` and name like ${lit(`${wsId}/%`)}` : ''
    }
  )
  select o.id, o.name, p[1] as ws_id, o.owner, o.owner_id, o.updated_at::text as updated_at,
    o.metadata->>'size' as size, o.metadata->>'mimetype' as mimetype,
    ${SKIP_RULES[root]} as skip_reason
  from o
  where p[1] ~* '${UUID_RE}' and array_length(p, 1) > 2 and ${ROOT_FILTERS[root]}
  order by o.id`;
}

function relative(key) {
  return key.slice(key.indexOf('/') + 1);
}

// Replaces whole JSON string values equal to `from` (never substrings of other
// values), so `storagePath`, `attachments[].storagePath` and similar keys all move.
function jsonRewrite({ name, table, column, from, to, scope = 'true' }) {
  const values = [
    [from, to],
    [
      `ai-file:${encodeURIComponent(from)}`,
      `ai-file:${encodeURIComponent(to)}`,
    ],
  ];
  let expr = `${column}::text`;
  let match = 'false';
  for (const [a, b] of values) {
    const needle = `to_jsonb(${lit(a)}::text)::text`;
    expr = `replace(${expr}, ${needle}, to_jsonb(${lit(b)}::text)::text)`;
    match = `${match} or strpos(${column}::text, ${needle}) > 0`;
  }
  return {
    name,
    sql: `update ${table} set ${column} = (${expr})::jsonb where ${scope} and (${match})`,
  };
}

function aiChatScope(key) {
  const p = key.split('/');
  if (
    p[1] === 'chats' &&
    p[2] === 'ai' &&
    p[3] === 'resources' &&
    new RegExp(UUID_RE).test(p[4] ?? '')
  ) {
    return `chat_id = ${lit(p[4])}`;
  }
  return 'true';
}

const REF_UPDATES = {
  chats: ({ from, to, wsId }) => [
    {
      name: 'chat_message_attachments',
      sql: `update private.chat_message_attachments a
        set storage_path = ${lit(relative(to))},
            full_path = case when a.full_path is null then null else ${lit(to)} end
        where (a.full_path = ${lit(from)}
           or (a.full_path is null and a.storage_path = ${lit(relative(from))}
               and coalesce(a.storage_ws_id, (select c.ws_id from private.chat_conversations c
                 where c.id = a.conversation_id)) = ${lit(wsId)}::uuid))`,
    },
    jsonRewrite({
      name: 'ai_chat_messages',
      table: 'public.ai_chat_messages',
      column: 'metadata',
      from,
      to,
      scope: aiChatScope(from),
    }),
  ],
  // Mira image keys name no chat, so this rewrite scans ai_chat_messages once
  // per object. Fine for the current scope (3 objects); scope it by message id
  // before running on a large Mira set. Credit rows are scoped by feature, not
  // workspace: their ws_id is the billing workspace, which can differ from the
  // image path's workspace, and the chat UI's sign-on-read owner check reads
  // ai_credit_transactions.metadata.storagePath.
  'mira/images': ({ from, to }) => [
    jsonRewrite({
      name: 'ai_chat_messages',
      table: 'public.ai_chat_messages',
      column: 'metadata',
      from,
      to,
    }),
    jsonRewrite({
      name: 'ai_credit_reservations',
      table: 'private.ai_credit_reservations',
      column: 'metadata',
      from,
      to,
      scope: `feature = 'image_generation'`,
    }),
    jsonRewrite({
      name: 'ai_credit_transactions',
      table: 'public.ai_credit_transactions',
      column: 'metadata',
      from,
      to,
      scope: `feature = 'image_generation'`,
    }),
  ],
  '.tuturuuu': ({ from, to }) => [
    {
      name: 'mobile_deployment_file_artifacts',
      sql: `update private.mobile_deployment_file_artifacts
        set storage_path = ${lit(relative(to))}
        where storage_provider = 'supabase' and storage_path = ${lit(relative(from))}`,
    },
  ],
};

export function refsUpdateSql(root, { bucket, entry, from, to, guard }) {
  const updates = REF_UPDATES[root]({ from, to, wsId: entry.wsId });
  const b = lit(bucket);
  const cas = guard
    ? ` and o.id = ${lit(entry.id)} and o.updated_at = ${lit(entry.oldUpdatedAt)}::timestamptz`
    : '';
  const ctes = [
    `g as (select o.id, o.owner, o.owner_id, o.created_at from storage.objects o
      where o.bucket_id = ${b} and o.name = ${lit(from)}${cas} for update)`,
    `n as (select o.id from storage.objects o where o.bucket_id = ${b} and o.name = ${lit(to)})`,
    `ok as (select (select count(*) from g) = 1 and (select count(*) from n) = 1 as v)`,
  ];
  if (guard) {
    // Storage copy runs as the service role, which drops ownership; restore it
    // (and created_at, which orders AI chat attachments) from the original.
    ctes.push(`fix as (update storage.objects t set owner = g.owner, owner_id = g.owner_id, created_at = g.created_at
      from g where t.bucket_id = ${b} and t.name = ${lit(to)} and (select v from ok) returning 1)`);
  }
  for (const update of updates) {
    ctes.push(
      `${update.name} as (${update.sql} and (select v from ok) returning 1)`
    );
  }
  const counts = updates.map(
    (u) => `(select count(*) from ${u.name})::int as ${u.name}`
  );
  return `with ${ctes.join(',\n')}
  select (select count(*) from g) = 1 as guard_ok, (select count(*) from n) = 1 as new_ok${
    guard ? ', (select count(*) from fix)::int as owner_restored' : ''
  }, ${counts.join(', ')}`;
}

function defineRoot(id, extra = {}) {
  return {
    id,
    ...extra,
    selectionSql: ({ bucket, wsId }) => selectionSql(id, { bucket, wsId }),
    precheckSql: ({ bucket, entry }) =>
      `select true as present, s.name, s.updated_at, s.skip_reason
       from (${selectionSql(id, { bucket, id: entry.id })}) s`,
    refsUpdateSql: (args) => refsUpdateSql(id, args),
    toSelection: (row) => ({
      id: row.id,
      root: id,
      wsId: row.ws_id,
      name: row.name,
      owner: row.owner,
      ownerId: row.owner_id,
      updatedAt: row.updated_at,
      size: row.size,
      mimetype: row.mimetype,
      skipReason: row.skip_reason,
    }),
  };
}

export const ROOTS = Object.freeze({
  chats: defineRoot('chats'),
  'mira/images': defineRoot('mira/images'),
  // The deployment vault re-key bumps draft inheritance revisions; it needs an
  // explicit reference confirmation before execution.
  '.tuturuuu': defineRoot('.tuturuuu', { requiresReferenceConfirmation: true }),
});

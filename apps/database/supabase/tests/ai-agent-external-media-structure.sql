begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(9);

select has_table(
  'private',
  'ai_agent_external_message_attachments',
  'external AI-agent media is stored privately'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.ai_agent_external_message_attachments'::regclass
  ),
  'external media metadata has RLS enabled'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.ai_agent_external_message_attachments',
    'select'
  ),
  'authenticated users cannot read external media metadata directly'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.ai_agent_external_message_attachments',
    'select,insert,update,delete'
  ),
  'service role can manage external media metadata'
);

select has_function(
  'private',
  'ai_agent_external_upsert_attachment',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'bigint', 'text', 'text'],
  'external media upsert RPC exists'
);

select has_function(
  'private',
  'ai_agent_external_get_attachment',
  array['uuid', 'text', 'uuid', 'uuid'],
  'workspace-scoped external media lookup RPC exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.ai_agent_external_get_attachment(uuid,text,uuid,uuid)',
    'execute'
  ),
  'authenticated users cannot invoke the private lookup directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.ai_agent_external_get_attachment(uuid,text,uuid,uuid)',
    'execute'
  ),
  'service role can resolve external media after route authorization'
);

select ok(
  pg_get_functiondef(
    'private.ai_agent_external_get_attachment(uuid,text,uuid,uuid)'::regprocedure
  ) ilike '%chat_assert_workspace_permission%',
  'external media lookup enforces workspace chat permission'
);

select * from finish();

rollback;

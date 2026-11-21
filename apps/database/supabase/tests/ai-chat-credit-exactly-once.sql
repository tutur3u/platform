begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

-- Fixtures: a funded and an empty wallet, owned by separate users so free-tier
-- workspaces do not share one user wallet, and four chat messages.
insert into public.users (id, display_name)
values
  ('32000000-0000-4000-8000-000000000001', 'Exactly-once owner'),
  ('32000000-0000-4000-8000-000000000002', 'Exactly-once empty owner')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  ('32000000-0000-4000-8000-000000000010', 'Exactly-once funded',
   '32000000-0000-4000-8000-000000000001', false),
  ('32000000-0000-4000-8000-000000000020', 'Exactly-once empty',
   '32000000-0000-4000-8000-000000000002', false)
on conflict (id) do nothing;

insert into public.ai_chats (id, title, creator_id)
values ('32000000-0000-4000-8000-000000000100', 'exactly-once probe',
        '32000000-0000-4000-8000-000000000001');

insert into public.ai_chat_messages (id, chat_id, content, creator_id, role)
values
  ('32000000-0000-4000-8000-0000000001a1', '32000000-0000-4000-8000-000000000100',
   'a', '32000000-0000-4000-8000-000000000001', 'ASSISTANT'),
  ('32000000-0000-4000-8000-0000000001b2', '32000000-0000-4000-8000-000000000100',
   'b', '32000000-0000-4000-8000-000000000001', 'ASSISTANT'),
  ('32000000-0000-4000-8000-0000000001c3', '32000000-0000-4000-8000-000000000100',
   'c', '32000000-0000-4000-8000-000000000001', 'ASSISTANT'),
  ('32000000-0000-4000-8000-0000000001d4', '32000000-0000-4000-8000-000000000100',
   'd', '32000000-0000-4000-8000-000000000001', 'ASSISTANT'),
  ('32000000-0000-4000-8000-0000000001e5', '32000000-0000-4000-8000-000000000100',
   'e', '32000000-0000-4000-8000-000000000001', 'ASSISTANT'),
  ('32000000-0000-4000-8000-0000000001f6', '32000000-0000-4000-8000-000000000100',
   'f', '32000000-0000-4000-8000-000000000001', 'ASSISTANT'),
  ('32000000-0000-4000-8000-0000000001a7', '32000000-0000-4000-8000-000000000100',
   'g', '32000000-0000-4000-8000-000000000001', 'ASSISTANT');

create temporary table funded_wallet as
select id from public.get_or_create_credit_balance(
  '32000000-0000-4000-8000-000000000010', '32000000-0000-4000-8000-000000000001'
);
update public.workspace_ai_credit_balances
   set total_allocated = 100000, bonus_credits = 0, total_used = 0
 where id = (select id from funded_wallet);

create temporary table empty_wallet as
select id from public.get_or_create_credit_balance(
  '32000000-0000-4000-8000-000000000020', '32000000-0000-4000-8000-000000000002'
);
update public.workspace_ai_credit_balances
   set total_allocated = 0, bonus_credits = 0, total_used = 0
 where id = (select id from empty_wallet);

create function pg_temp.charge(p_message uuid)
returns table (success boolean, credits_deducted numeric)
language sql as $$
  select d.success, d.credits_deducted
    from public.deduct_ai_credits(
      p_ws_id => '32000000-0000-4000-8000-000000000010',
      p_model_id => 'google/gemini-3.1-flash-lite',
      p_input_tokens => 1000,
      p_output_tokens => 500,
      p_feature => 'chat',
      p_chat_message_id => p_message,
      p_user_id => '32000000-0000-4000-8000-000000000001'
    ) d;
$$;

create function pg_temp.deductions(p_message uuid) returns bigint
language sql as $$
  select count(*) from public.ai_credit_transactions
   where chat_message_id = p_message and transaction_type = 'deduction';
$$;

create function pg_temp.used() returns numeric
language sql as $$
  select total_used from public.workspace_ai_credit_balances
   where id = (select id from funded_wallet);
$$;

-- The index.
select ok(
  exists (
    select 1 from pg_index i
     where i.indexrelid = 'public.ai_credit_transactions_one_chat_message_deduction'::regclass
       and i.indisunique
       and pg_get_expr(i.indpred, i.indrelid) like '%deduction%'
       and pg_get_expr(i.indpred, i.indrelid) like '%created_at >= ''2026-11-21 00:00:00+00''%'
  ),
  'one deduction per chat message is a unique partial index'
);

-- First settlement charges once.
create temporary table first_charge as
select * from pg_temp.charge('32000000-0000-4000-8000-0000000001a1');
create temporary table used_after_first as select pg_temp.used() as used;

select is((select success from first_charge), true, 'first settlement succeeds');
select ok((select credits_deducted from first_charge) > 0, 'first settlement charges credits');
select is(pg_temp.deductions('32000000-0000-4000-8000-0000000001a1'), 1::bigint,
  'first settlement writes one deduction');

-- A repeated settlement returns the earlier charge without charging again.
create temporary table second_charge as
select * from pg_temp.charge('32000000-0000-4000-8000-0000000001a1');

select is((select success from second_charge), true, 'repeated settlement reports success');
select is((select credits_deducted from second_charge),
  (select credits_deducted from first_charge),
  'repeated settlement returns the earlier amount');
select is(pg_temp.deductions('32000000-0000-4000-8000-0000000001a1'), 1::bigint,
  'repeated settlement writes no second deduction');
select is(pg_temp.used(), (select used from used_after_first),
  'repeated settlement leaves the wallet unchanged');

-- The index rejects a second deduction row written directly.
select throws_ok(
  $$insert into public.ai_credit_transactions
      (ws_id, balance_id, chat_message_id, transaction_type, amount, model_id, feature)
    values ('32000000-0000-4000-8000-000000000010', (select id from funded_wallet),
            '32000000-0000-4000-8000-0000000001a1', 'deduction', -1,
            'google/gemini-3.1-flash-lite', 'chat')$$,
  '23505',
  null,
  'a second deduction row for one chat message is rejected'
);

-- Non-deduction rows and rows without a message are not constrained.
select lives_ok(
  $$insert into public.ai_credit_transactions
      (ws_id, balance_id, chat_message_id, transaction_type, amount)
    values ('32000000-0000-4000-8000-000000000010', (select id from funded_wallet),
            '32000000-0000-4000-8000-0000000001a1', 'refund', 1)$$,
  'a refund for a charged message is still allowed'
);

-- Recording unbilled charges.
select is(
  public.record_unbilled_ai_charge(
    '32000000-0000-4000-8000-0000000001b2', '32000000-0000-4000-8000-000000000010',
    '32000000-0000-4000-8000-000000000001', 'google/gemini-3.1-flash-lite', 'chat',
    1000, 500, 0, 0, 'Error: cookies() outside a request scope'),
  true, 'an unbilled charge is recorded');
select is(
  public.record_unbilled_ai_charge(
    '32000000-0000-4000-8000-0000000001b2', '32000000-0000-4000-8000-000000000010',
    '32000000-0000-4000-8000-000000000001', 'google/gemini-3.1-flash-lite', 'chat',
    9999, 9999, 0, 0, 'second'),
  true, 'recording the same message again is accepted');
select is(
  (select input_tokens from private.ai_credit_unbilled_charges
    where chat_message_id = '32000000-0000-4000-8000-0000000001b2'),
  1000, 'the first record for a message is kept');
select is(
  public.record_unbilled_ai_charge(
    '32000000-0000-4000-8000-0000000001c3', '32000000-0000-4000-8000-000000000010',
    null, 'google/gemini-3.1-flash-lite', 'chat', -1, 0),
  false, 'negative usage is not recorded');

-- An already-charged message recorded as unbilled must not be charged again.
select public.record_unbilled_ai_charge(
  '32000000-0000-4000-8000-0000000001a1', '32000000-0000-4000-8000-000000000010',
  '32000000-0000-4000-8000-000000000001', 'google/gemini-3.1-flash-lite', 'chat',
  1000, 500);

-- A row on its last attempt against an empty wallet.
insert into private.ai_credit_unbilled_charges
  (chat_message_id, ws_id, user_id, model_id, feature, input_tokens,
   output_tokens, attempts)
values ('32000000-0000-4000-8000-0000000001d4', '32000000-0000-4000-8000-000000000020',
        '32000000-0000-4000-8000-000000000002', 'google/gemini-3.1-flash-lite',
        'chat', 1000, 500, 4);

select is(private.settle_unbilled_ai_charges(0),
  '{"failed": 0, "settled": 0, "abandoned": 0}'::jsonb,
  'a zero limit settles nothing');

select is(private.settle_unbilled_ai_charges(100),
  '{"failed": 0, "settled": 2, "abandoned": 1}'::jsonb,
  'settlement charges pending rows and abandons the exhausted one');

select is(pg_temp.deductions('32000000-0000-4000-8000-0000000001b2'), 1::bigint,
  'the unbilled message is charged once');
select is(pg_temp.deductions('32000000-0000-4000-8000-0000000001a1'), 1::bigint,
  'the already-charged message is not charged again');
select is(
  (select status || ':' || attempts from private.ai_credit_unbilled_charges
    where chat_message_id = '32000000-0000-4000-8000-0000000001b2'),
  'settled:1', 'the charged row is settled after one attempt');
select is(
  (select status || ':' || attempts || ':' || last_error
     from private.ai_credit_unbilled_charges
    where chat_message_id = '32000000-0000-4000-8000-0000000001d4'),
  'abandoned:5:INSUFFICIENT_CREDITS', 'the exhausted row is abandoned with its cause');

select is(private.settle_unbilled_ai_charges(100),
  '{"failed": 0, "settled": 0, "abandoned": 0}'::jsonb,
  'a repeated run settles nothing');

-- Rows before the cutoff are outside the index; rows after it are not.
insert into public.ai_credit_transactions
  (ws_id, balance_id, chat_message_id, transaction_type, amount, created_at)
values ('32000000-0000-4000-8000-000000000010', (select id from funded_wallet),
        '32000000-0000-4000-8000-0000000001e5', 'deduction', -1,
        timestamptz '2026-11-20 12:00:00+00');
select lives_ok(
  $$insert into public.ai_credit_transactions
      (ws_id, balance_id, chat_message_id, transaction_type, amount)
    values ('32000000-0000-4000-8000-000000000010', (select id from funded_wallet),
            '32000000-0000-4000-8000-0000000001e5', 'deduction', -1)$$,
  'a deduction before the cutoff does not block the first one after it'
);
select throws_ok(
  $$insert into public.ai_credit_transactions
      (ws_id, balance_id, chat_message_id, transaction_type, amount)
    values ('32000000-0000-4000-8000-000000000010', (select id from funded_wallet),
            '32000000-0000-4000-8000-0000000001e5', 'deduction', -1)$$,
  '23505',
  null,
  'a second deduction after the cutoff is still rejected'
);

-- Deleting the message or the user keeps the record and charges no wallet.
-- 32000000-...0003 has no users row: the stale id a deleted user leaves.
select public.record_unbilled_ai_charge(
  '32000000-0000-4000-8000-0000000001f6', '32000000-0000-4000-8000-000000000010',
  '32000000-0000-4000-8000-000000000001', 'google/gemini-3.1-flash-lite', 'chat',
  1000, 500);
select public.record_unbilled_ai_charge(
  '32000000-0000-4000-8000-0000000001a7', '32000000-0000-4000-8000-000000000010',
  '32000000-0000-4000-8000-000000000003', 'google/gemini-3.1-flash-lite', 'chat',
  1000, 500);
delete from public.ai_chat_messages where id = '32000000-0000-4000-8000-0000000001f6';
create temporary table used_before_deleted as select pg_temp.used() as used;

select is(
  (select count(*)::integer from private.ai_credit_unbilled_charges
    where chat_message_id in ('32000000-0000-4000-8000-0000000001f6',
                              '32000000-0000-4000-8000-0000000001a7')),
  2, 'deleting the message or the user keeps its unbilled record');
select is(private.settle_unbilled_ai_charges(100),
  '{"failed": 2, "settled": 0, "abandoned": 0}'::jsonb,
  'charges for a deleted message or user fail instead of settling');
select is(pg_temp.used(), (select used from used_before_deleted),
  'a deleted user is never billed to another wallet');
select is(
  (select count(*)::integer from public.ai_credit_transactions
    where chat_message_id = '32000000-0000-4000-8000-0000000001a7'),
  0, 'the deleted user''s charge writes no deduction');

-- Access: service role only.
select ok(
  (select relrowsecurity from pg_class
    where oid = 'private.ai_credit_unbilled_charges'::regclass),
  'the unbilled store has row level security');
select ok(
  not has_table_privilege('authenticated', 'private.ai_credit_unbilled_charges', 'select')
    and not has_table_privilege('anon', 'private.ai_credit_unbilled_charges', 'select'),
  'clients cannot read the unbilled store');
select ok(
  not has_function_privilege('authenticated',
    'public.record_unbilled_ai_charge(uuid, uuid, uuid, text, text, integer, integer, integer, integer, text)',
    'execute')
    and not has_function_privilege('anon',
      'public.record_unbilled_ai_charge(uuid, uuid, uuid, text, text, integer, integer, integer, integer, text)',
      'execute'),
  'clients cannot record unbilled charges');
select ok(
  not has_function_privilege('authenticated', 'private.settle_unbilled_ai_charges(integer)', 'execute')
    and has_function_privilege('service_role', 'private.settle_unbilled_ai_charges(integer)', 'execute'),
  'only the service role can run settlement');
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=pg_catalog, pg_temp'])
     from pg_proc p
    where p.oid in (
      'public.deduct_ai_credits(uuid, text, integer, integer, integer, text, uuid, uuid, jsonb, uuid, integer, integer)'::regprocedure,
      'public.record_unbilled_ai_charge(uuid, uuid, uuid, text, text, integer, integer, integer, integer, text)'::regprocedure,
      'private.settle_unbilled_ai_charges(integer)'::regprocedure)),
  'the functions are security definer with a pinned search path');

select * from finish();
rollback;

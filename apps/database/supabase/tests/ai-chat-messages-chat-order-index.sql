begin;
select plan(3);

select has_index(
  'public', 'ai_chat_messages',
  'ai_chat_messages_chat_created_idx',
  'per-chat message reads have an ordered index'
);

select is(
  (
    select pg_get_indexdef(indexrelid)
    from pg_index
    where indexrelid = 'public.ai_chat_messages_chat_created_idx'::regclass
  ),
  'CREATE INDEX ai_chat_messages_chat_created_idx ON public.ai_chat_messages USING btree (chat_id, created_at, id)',
  'index matches the (chat_id, created_at, id) read order'
);

set local enable_seqscan = off;
set local enable_bitmapscan = off;
create temporary table chat_order_plan (line text) on commit drop;
do $$
declare
  plan_line text;
begin
  for plan_line in
    execute 'explain select role, content, metadata from public.ai_chat_messages
      where chat_id = ''00000000-0000-4000-8000-000000000001''
      order by created_at desc, id desc limit 60'
  loop
    insert into chat_order_plan values (plan_line);
  end loop;
end
$$;

select ok(
  exists (
    select 1 from chat_order_plan
    where line like '%ai_chat_messages_chat_created_idx%'
      and line not like '%Bitmap%'
  ) and not exists (select 1 from chat_order_plan where line like '%Sort%'),
  'newest-first per-chat reads scan the index without a sort'
);

select * from finish();
rollback;

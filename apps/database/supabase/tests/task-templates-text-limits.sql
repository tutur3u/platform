begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('7a5c0000-0000-4000-8000-0000000000e1', 'task-template-limits@example.test', now(), '{}', '{}');
insert into public.workspaces (id, name, personal, creator_id) values
  ('7a5c0000-0000-4000-8000-0000000000e2', 'Task template limits', false,
   '7a5c0000-0000-4000-8000-0000000000e1');

create function pg_temp.insert_template(
  p_slug text, p_name text, p_task_name text, p_description text
) returns void language sql as $$
  insert into public.task_templates (ws_id, created_by, slug, name, task_name, description)
  values ('7a5c0000-0000-4000-8000-0000000000e2', '7a5c0000-0000-4000-8000-0000000000e1',
    p_slug, p_name, p_task_name, p_description);
$$;

select lives_ok(
  $$select pg_temp.insert_template(repeat('s', 120), repeat('é', 1024), repeat('é', 1024), repeat('é', 10000))$$,
  'templates accept the Tasks API limits, including multibyte text'
);
select throws_ok(
  $$select pg_temp.insert_template(repeat('s', 121), 'Name', 'Task', null)$$,
  '23514', null, 'template slugs reject 121 characters'
);
select throws_ok(
  $$select pg_temp.insert_template('name-limit', repeat('a', 1025), 'Task', null)$$,
  '23514', null, 'template names reject 1,025 characters'
);
select throws_ok(
  $$select pg_temp.insert_template('task-name-limit', 'Name', repeat('a', 1025), null)$$,
  '23514', null, 'template task names reject 1,025 characters'
);
select throws_ok(
  $$select pg_temp.insert_template('description-limit', 'Name', 'Task', repeat('a', 10001))$$,
  '23514', null, 'template descriptions reject 10,001 characters'
);
select lives_ok(
  $$select pg_temp.insert_template('no-description', 'Name', 'Task', null)$$,
  'templates without a description still insert'
);
select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.task_templates'::regclass
     and conname like '%\_strict\_%\_check' escape '\'),
  8,
  'task templates carry length and byte checks for every text column'
);
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'task_templates'
     and data_type in ('text', 'character varying', 'character')),
  4,
  'task templates have exactly the four checked text columns'
);

select * from finish();
rollback;

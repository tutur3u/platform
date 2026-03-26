begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(12);

insert into public.users (id)
values ('00000000-0000-0000-0000-00000000010A')
on conflict (id) do nothing;

insert into public.user_private_details (user_id, email, new_email)
values (
  '00000000-0000-0000-0000-00000000010A',
  'review-owner@example.com',
  null
)
on conflict (user_id) do update
set
  email = excluded.email,
  new_email = excluded.new_email;

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000111',
  'authenticated',
  'authenticated',
  'sender@example.com',
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-00000000010B',
  'Post Review RPC Workspace',
  false,
  '00000000-0000-0000-0000-00000000010A'
)
on conflict (id) do nothing;

insert into public.workspace_users (id, ws_id, full_name, display_name, email)
values
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-00000000010B', 'Missing Check User', 'Missing Check User', 'missing-check@example.com'),
  ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-00000000010B', 'Pending Approval User', 'Pending Approval User', 'pending-approval@example.com'),
  ('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0000-00000000010B', 'Approved Awaiting Delivery User', 'Approved Awaiting Delivery User', 'approved-awaiting@example.com'),
  ('00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0000-00000000010B', 'Queued User', 'Queued User', 'queued@example.com'),
  ('00000000-0000-0000-0000-000000000115', '00000000-0000-0000-0000-00000000010B', 'Sent User', 'Sent User', 'sent@example.com'),
  ('00000000-0000-0000-0000-000000000116', '00000000-0000-0000-0000-00000000010B', 'Delivery Failed User', 'Delivery Failed User', 'delivery-failed@example.com'),
  ('00000000-0000-0000-0000-000000000117', '00000000-0000-0000-0000-00000000010B', 'Skipped User', 'Skipped User', 'skipped@example.com'),
  ('00000000-0000-0000-0000-000000000118', '00000000-0000-0000-0000-00000000010B', 'Rejected User', 'Rejected User', 'rejected@example.com'),
  ('00000000-0000-0000-0000-000000000119', '00000000-0000-0000-0000-00000000010B', 'Missing Email Approved User', 'Missing Email Approved User', null)
on conflict (id) do nothing;

insert into public.workspace_user_groups (id, ws_id, name)
values (
  '00000000-0000-0000-0000-00000000010C',
  '00000000-0000-0000-0000-00000000010B',
  'Review RPC Group'
)
on conflict (id) do nothing;

insert into public.workspace_user_groups_users (group_id, user_id, role)
values
  ('00000000-0000-0000-0000-00000000010C', '00000000-0000-0000-0000-000000000111', 'USER'),
  ('00000000-0000-0000-0000-00000000010C', '00000000-0000-0000-0000-000000000112', 'USER'),
  ('00000000-0000-0000-0000-00000000010C', '00000000-0000-0000-0000-000000000113', 'USER'),
  ('00000000-0000-0000-0000-00000000010C', '00000000-0000-0000-0000-000000000114', 'USER'),
  ('00000000-0000-0000-0000-00000000010C', '00000000-0000-0000-0000-000000000115', 'USER'),
  ('00000000-0000-0000-0000-00000000010C', '00000000-0000-0000-0000-000000000116', 'USER'),
  ('00000000-0000-0000-0000-00000000010C', '00000000-0000-0000-0000-000000000117', 'USER'),
  ('00000000-0000-0000-0000-00000000010C', '00000000-0000-0000-0000-000000000118', 'USER'),
  ('00000000-0000-0000-0000-00000000010C', '00000000-0000-0000-0000-000000000119', 'USER')
on conflict do nothing;

insert into public.user_group_posts (
  id,
  group_id,
  title,
  content,
  creator_id,
  updated_by,
  post_approval_status,
  approved_by,
  approved_at
)
values (
  '00000000-0000-0000-0000-00000000010D',
  '00000000-0000-0000-0000-00000000010C',
  'Review RPC Post',
  'Post content',
  '00000000-0000-0000-0000-000000000111',
  '00000000-0000-0000-0000-000000000111',
  'APPROVED',
  '00000000-0000-0000-0000-000000000111',
  now()
)
on conflict (id) do nothing;

insert into public.sent_emails (
  id,
  ws_id,
  sender_id,
  receiver_id,
  source_name,
  source_email,
  email,
  subject,
  content,
  post_id
)
values (
  '00000000-0000-0000-0000-00000000010E',
  '00000000-0000-0000-0000-00000000010B',
  '00000000-0000-0000-0000-000000000111',
  '00000000-0000-0000-0000-000000000115',
  'System Sender',
  'sender@example.com',
  'sent@example.com',
  'Sent subject',
  'Sent content',
  '00000000-0000-0000-0000-00000000010D'
)
on conflict (id) do nothing;

insert into public.user_group_post_checks (
  post_id,
  user_id,
  is_completed,
  notes,
  approval_status,
  approved_by,
  approved_at,
  email_id
)
values
  ('00000000-0000-0000-0000-00000000010D', '00000000-0000-0000-0000-000000000112', true, 'Pending note', 'PENDING', null, null, null),
  ('00000000-0000-0000-0000-00000000010D', '00000000-0000-0000-0000-000000000113', true, 'Approved awaiting note', 'APPROVED', '00000000-0000-0000-0000-000000000111', now(), null),
  ('00000000-0000-0000-0000-00000000010D', '00000000-0000-0000-0000-000000000114', true, 'Queued note', 'APPROVED', '00000000-0000-0000-0000-000000000111', now(), null),
  ('00000000-0000-0000-0000-00000000010D', '00000000-0000-0000-0000-000000000115', true, 'Sent note', 'APPROVED', '00000000-0000-0000-0000-000000000111', now(), null),
  ('00000000-0000-0000-0000-00000000010D', '00000000-0000-0000-0000-000000000116', false, 'Blocked note', 'APPROVED', '00000000-0000-0000-0000-000000000111', now(), null),
  ('00000000-0000-0000-0000-00000000010D', '00000000-0000-0000-0000-000000000117', true, 'Skipped note', 'SKIPPED', null, null, null),
  ('00000000-0000-0000-0000-00000000010D', '00000000-0000-0000-0000-000000000118', false, 'Rejected note', 'REJECTED', null, null, null),
  ('00000000-0000-0000-0000-00000000010D', '00000000-0000-0000-0000-000000000119', true, 'Missing email approved note', 'APPROVED', '00000000-0000-0000-0000-000000000111', now(), null)
on conflict (post_id, user_id) do update
set
  is_completed = excluded.is_completed,
  notes = excluded.notes,
  approval_status = excluded.approval_status,
  approved_by = excluded.approved_by,
  approved_at = excluded.approved_at,
  email_id = excluded.email_id;

insert into public.post_email_queue (
  id,
  ws_id,
  group_id,
  post_id,
  user_id,
  sender_platform_user_id,
  status
)
values
  (
    '00000000-0000-0000-0000-000000000121',
    '00000000-0000-0000-0000-00000000010B',
    '00000000-0000-0000-0000-00000000010C',
    '00000000-0000-0000-0000-00000000010D',
    '00000000-0000-0000-0000-000000000114',
    '00000000-0000-0000-0000-00000000010A',
    'queued'
  ),
  (
    '00000000-0000-0000-0000-000000000122',
    '00000000-0000-0000-0000-00000000010B',
    '00000000-0000-0000-0000-00000000010C',
    '00000000-0000-0000-0000-00000000010D',
    '00000000-0000-0000-0000-000000000116',
    '00000000-0000-0000-0000-00000000010A',
    'blocked'
  ),
  (
    '00000000-0000-0000-0000-000000000123',
    '00000000-0000-0000-0000-00000000010B',
    '00000000-0000-0000-0000-00000000010C',
    '00000000-0000-0000-0000-00000000010D',
    '00000000-0000-0000-0000-000000000117',
    '00000000-0000-0000-0000-00000000010A',
    'skipped'
  )
on conflict (post_id, user_id) do update
set status = excluded.status;

select is(
  (
    select review_stage
    from public.get_workspace_post_review_rows(
      p_ws_id => '00000000-0000-0000-0000-00000000010B',
      p_limit => 20
    )
    where user_id = '00000000-0000-0000-0000-000000000119'
  ),
  'delivery_failed',
  'approved recipients without an email resolve to delivery_failed'
);

select is(
  (
    select review_stage
    from public.get_workspace_post_review_rows(
      p_ws_id => '00000000-0000-0000-0000-00000000010B',
      p_limit => 20
    )
    where user_id = '00000000-0000-0000-0000-000000000115'
  ),
  'sent',
  'approved recipients with direct sent_emails coverage resolve to sent'
);

select is(
  (
    select review_stage
    from public.get_workspace_post_review_rows(
      p_ws_id => '00000000-0000-0000-0000-00000000010B',
      p_limit => 20
    )
    where user_id = '00000000-0000-0000-0000-000000000111'
  ),
  'missing_check',
  'recipient without a check row is surfaced as missing_check'
);

select is(
  (
    select review_stage
    from public.get_workspace_post_review_rows(
      p_ws_id => '00000000-0000-0000-0000-00000000010B',
      p_limit => 20
    )
    where user_id = '00000000-0000-0000-0000-000000000112'
  ),
  'pending_approval',
  'pending approval check rows stay in pending_approval'
);

select is(
  (
    select review_stage
    from public.get_workspace_post_review_rows(
      p_ws_id => '00000000-0000-0000-0000-00000000010B',
      p_limit => 20
    )
    where user_id = '00000000-0000-0000-0000-000000000113'
  ),
  'approved_awaiting_delivery',
  'approved recipients without queue rows stay in approved_awaiting_delivery'
);

select is(
  (
    select review_stage
    from public.get_workspace_post_review_rows(
      p_ws_id => '00000000-0000-0000-0000-00000000010B',
      p_limit => 20
    )
    where user_id = '00000000-0000-0000-0000-000000000116'
  ),
  'delivery_failed',
  'blocked queue rows map to delivery_failed'
);

select is(
  (
    select review_stage
    from public.get_workspace_post_review_rows(
      p_ws_id => '00000000-0000-0000-0000-00000000010B',
      p_limit => 20
    )
    where user_id = '00000000-0000-0000-0000-000000000118'
  ),
  'rejected',
  'rejected approval rows stay rejected'
);

select is(
  (
    select total_count
    from public.get_workspace_post_review_summary(
      p_ws_id => '00000000-0000-0000-0000-00000000010B'
    )
  ),
  9::bigint,
  'workspace post review summary counts every recipient row'
);

select is(
  (
    select
      missing_check_count
      + pending_approval_stage_count
      + approved_awaiting_delivery_count
      + queued_stage_count
      + processing_stage_count
      + sent_stage_count
      + delivery_failed_count
      + skipped_stage_count
      + rejected_stage_count
    from public.get_workspace_post_review_summary(
      p_ws_id => '00000000-0000-0000-0000-00000000010B'
    )
  ),
  9::bigint,
  'stage counts sum to total_count'
);

select is(
  (
    select total_count
    from public.get_user_group_post_status_summary(
      p_ws_id => '00000000-0000-0000-0000-00000000010B',
      p_group_id => '00000000-0000-0000-0000-00000000010C',
      p_post_id => '00000000-0000-0000-0000-00000000010D'
    )
  ),
  9::bigint,
  'group post status summary counts all group members for the post'
);

select is(
  (
    select unchecked_count
    from public.get_user_group_post_status_summary(
      p_ws_id => '00000000-0000-0000-0000-00000000010B',
      p_group_id => '00000000-0000-0000-0000-00000000010C',
      p_post_id => '00000000-0000-0000-0000-00000000010D'
    )
  ),
  1::bigint,
  'group post status summary reports missing-check recipients as unchecked'
);

select ok(
  exists (
    select 1
    from public.get_workspace_post_review_filter_options(
      p_ws_id => '00000000-0000-0000-0000-00000000010B'
    )
    where option_scope = 'user'
      and id = '00000000-0000-0000-0000-000000000111'
  ),
  'filter options include users who only exist as missing-check recipients'
);

select finish();
rollback;

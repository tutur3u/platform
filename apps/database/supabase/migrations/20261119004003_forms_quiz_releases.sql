create table private.form_quiz_releases (
  version_id uuid not null,
  form_id uuid not null,
  ws_id uuid not null,
  launch_id uuid not null,
  released_at timestamptz not null default statement_timestamp(),
  primary key (version_id, launch_id),
  foreign key (version_id, form_id, ws_id)
    references private.form_published_versions (id, form_id, ws_id) on delete cascade
);

alter table private.form_quiz_releases enable row level security;
alter table private.form_quiz_releases force row level security;

revoke all on private.form_quiz_releases from public, anon, authenticated, service_role;
grant select, insert on private.form_quiz_releases to service_role;

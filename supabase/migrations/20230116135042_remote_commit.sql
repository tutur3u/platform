drop index if exists "auth"."identities_email_idx";

drop index if exists "auth"."users_email_partial_key";

create table "auth"."sso_sessions" (
    "id" uuid not null,
    "session_id" uuid not null,
    "sso_provider_id" uuid,
    "not_before" timestamp with time zone,
    "not_after" timestamp with time zone,
    "idp_initiated" boolean default false,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


alter table "auth"."identities" drop column "email";

alter table "auth"."users" drop column "is_sso_user";

CREATE INDEX refresh_token_session_id ON auth.refresh_tokens USING btree (session_id);

CREATE UNIQUE INDEX sso_sessions_pkey ON auth.sso_sessions USING btree (id);

CREATE INDEX sso_sessions_session_id_idx ON auth.sso_sessions USING btree (session_id);

CREATE INDEX sso_sessions_sso_provider_id_idx ON auth.sso_sessions USING btree (sso_provider_id);

CREATE UNIQUE INDEX users_email_key ON auth.users USING btree (email);

alter table "auth"."sso_sessions" add constraint "sso_sessions_pkey" PRIMARY KEY using index "sso_sessions_pkey";

alter table "auth"."sso_sessions" add constraint "sso_sessions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE not valid;

alter table "auth"."sso_sessions" validate constraint "sso_sessions_session_id_fkey";

alter table "auth"."sso_sessions" add constraint "sso_sessions_sso_provider_id_fkey" FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE not valid;

alter table "auth"."sso_sessions" validate constraint "sso_sessions_sso_provider_id_fkey";

alter table "auth"."users" add constraint "users_email_key" UNIQUE using index "users_email_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION auth.email()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  	coalesce(
		nullif(current_setting('request.jwt.claim.email', true), ''),
		(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
	)::text
$function$
;

CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  	coalesce(
		nullif(current_setting('request.jwt.claim.role', true), ''),
		(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
	)::text
$function$
;

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  	coalesce(
		nullif(current_setting('request.jwt.claim.sub', true), ''),
		(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
	)::uuid
$function$
;

CREATE TRIGGER create_profile_for_new_user_tr BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION create_profile_for_new_user();


set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_org_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin
  insert into public.org_members(org_id, user_id)
  values (new.id, auth.uid());
  return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.add_task_board_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin
  insert into public.task_board_members(board_id, user_id)
  values (new.id, auth.uid());
  return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.delete_invite_when_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$begin
delete FROM
  public.org_invites i
WHERE
  i.org_id = new.org_id
  AND i.user_id = new.user_id;
return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.get_user_tasks(_board_id uuid)
 RETURNS TABLE(id uuid, name text, description text, priority smallint, completed boolean, start_date timestamp with time zone, end_date timestamp with time zone, list_id uuid, board_id uuid)
 LANGUAGE plpgsql
AS $function$
	begin
		return query
			select t.id, t.name, t.description, t.priority, t.completed, t.start_date, t.end_date, t.list_id, l.board_id
      from tasks t, task_lists l, task_assignees a
      where auth.uid() = a.user_id and
      l.board_id = _board_id and
      t.list_id = l.id and
      t.id = a.task_id and
      t.completed = false
      order by t.priority DESC, t.end_date ASC NULLS LAST;
	end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_list_accessible(_list_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM task_lists tl
  WHERE tl.id = _list_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_member_invited(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM org_invites oi
  WHERE oi.org_id = _org_id
  AND oi.user_id = _user_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM org_members om
  WHERE om.org_id = _org_id
  AND om.user_id = _user_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_accessible(_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM tasks
  WHERE tasks.id = _task_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_board_member(_user_id uuid, _board_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM task_board_members tbm
  WHERE tbm.board_id = _board_id
  AND tbm.user_id = _user_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_user_task_in_board(_user_id uuid, _task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM task_board_members tbm, tasks, task_lists lists
  WHERE tasks.id = _task_id
  AND lists.id = tasks.list_id
  AND tbm.board_id = lists.board_id
  AND tbm.user_id = _user_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.search_users_by_name(search_query character varying)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
 LANGUAGE plpgsql
AS $function$
	begin
		return query
			SELECT
        u.id,
        u.username,
        u.display_name,
        u.avatar_url
      FROM
        public.users u
      WHERE search_query % ANY(STRING_TO_ARRAY(u.username, ' '))
      OR search_query % ANY(STRING_TO_ARRAY(u.display_name, ' '))
      OR search_query % ANY(STRING_TO_ARRAY(u.email, ' '))
      ORDER BY u.created_at
      LIMIT 5;
	end;
$function$
;


create policy "Enable insert for authenticated users only"
on "storage"."buckets"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable insert for authenticated users only"
on "storage"."objects"
as permissive
for insert
to authenticated
with check (true);




alter table "auth"."sso_sessions" drop constraint "sso_sessions_session_id_fkey";

alter table "auth"."sso_sessions" drop constraint "sso_sessions_sso_provider_id_fkey";

alter table "auth"."users" drop constraint "users_email_key";

alter table "auth"."sso_sessions" drop constraint "sso_sessions_pkey";

drop index if exists "auth"."sso_sessions_pkey";

drop index if exists "auth"."sso_sessions_session_id_idx";

drop index if exists "auth"."sso_sessions_sso_provider_id_idx";

drop index if exists "auth"."users_email_key";

drop table "auth"."sso_sessions";

alter table "auth"."identities" add column "email" text generated always as (lower((identity_data ->> 'email'::text))) stored;

alter table "auth"."users" add column "is_sso_user" boolean not null default false;

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);

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



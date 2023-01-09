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
alter table "auth"."sso_sessions"
add constraint "sso_sessions_pkey" PRIMARY KEY using index "sso_sessions_pkey";
alter table "auth"."sso_sessions"
add constraint "sso_sessions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE not valid;
alter table "auth"."sso_sessions" validate constraint "sso_sessions_session_id_fkey";
alter table "auth"."sso_sessions"
add constraint "sso_sessions_sso_provider_id_fkey" FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE not valid;
alter table "auth"."sso_sessions" validate constraint "sso_sessions_sso_provider_id_fkey";
alter table "auth"."users"
add constraint "users_email_key" UNIQUE using index "users_email_key";
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $function$
select coalesce(
		nullif(
			current_setting('request.jwt.claim.email', true),
			''
		),
		(
			nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email'
		)
	)::text $function$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $function$
select coalesce(
		nullif(
			current_setting('request.jwt.claim.role', true),
			''
		),
		(
			nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
		)
	)::text $function$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $function$
select coalesce(
		nullif(
			current_setting('request.jwt.claim.sub', true),
			''
		),
		(
			nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
		)
	)::uuid $function$;
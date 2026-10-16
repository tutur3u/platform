-- Qualification fixture only: intentionally NOT the composed Supabase schema.
create schema auth;
create schema private;
create schema extensions;
create extension pgcrypto with schema extensions;
create role anon;
create role authenticated;
create role service_role;
grant usage on schema private to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key, email text, encrypted_password text, raw_app_meta_data jsonb,
  raw_user_meta_data jsonb, banned_until timestamptz, role text, aud text, phone text,
  phone_confirmed_at timestamptz, deleted_at timestamptz, is_sso_user boolean,
  email_confirmed_at timestamptz, email_change text, is_anonymous boolean not null default false
);
create table auth.identities (id uuid primary key, provider text, user_id uuid, identity_data jsonb, provider_id text);
create table public.users (id uuid primary key, display_name text);
create table public.user_private_details (user_id uuid primary key, email text, new_email text, updated_at timestamptz, full_name text);
create table public.workspace_members (ws_id uuid, user_id uuid, type text);
create table public.workspaces (id uuid, creator_id uuid);
create table public.workspace_default_permissions (ws_id uuid, member_type text, permission text, enabled boolean);
create table public.workspace_roles (id uuid, ws_id uuid);
create table public.workspace_role_members (role_id uuid, user_id uuid);
create table public.workspace_role_permissions (role_id uuid, ws_id uuid, permission text, enabled boolean);
create table public.platform_user_roles (user_id uuid, enabled boolean);
create table public.platform_email_roles (email text);
create table private.mail_domains (id uuid primary key, domain text unique, status text);
create table private.mail_mailboxes (id uuid primary key, address text unique, domain_id uuid, created_by uuid, type text, status text);
create table private.mail_mailbox_members (id uuid primary key, mailbox_id uuid, user_id uuid, role text);
create table private.infrastructure_employees (user_id uuid, staff_email text);
create table private.employee_creation_intents (user_id uuid, staff_email text);
create table private.employee_creation_operations (target_id uuid, staff_email text);
create table private.employee_restore_operations (user_id uuid, phase text);

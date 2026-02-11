-- Create the new enum type with the additional values
create type "public"."workspace_api_key_scope_new" as enum ('gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-pro', 'gemini-2.5-pro', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite');

-- Drop the default constraint first
alter table "public"."workspace_api_keys" alter column "scopes" drop default;

-- Update the column to use the new enum type
alter table "public"."workspace_api_keys" 
  alter column "scopes" type "public"."workspace_api_key_scope_new"[] 
  using "scopes"::text[]::"public"."workspace_api_key_scope_new"[];

-- Drop the old enum type
drop type "public"."workspace_api_key_scope";

-- Rename the new enum type to the original name
alter type "public"."workspace_api_key_scope_new" rename to "workspace_api_key_scope";

-- Re-add the default constraint with the new enum type
alter table "public"."workspace_api_keys" alter column "scopes" set default '{}';



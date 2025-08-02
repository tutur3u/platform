alter type "public"."workspace_api_key_scope" rename to "workspace_api_key_scope__old_version_to_be_dropped";

create type "public"."workspace_api_key_scope" as enum ('gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-pro', 'gemini-2.5-pro', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite');

drop type "public"."workspace_api_key_scope__old_version_to_be_dropped";



begin;

do $rollback$
begin
    drop trigger if exists enforce_azure_identity_link_verification on auth.identities;
exception when insufficient_privilege then
    -- Hosted postgres has TRIGGER privilege but does not own auth.identities.
    -- Dropping its own dedicated helper removes the dependent trigger.
    -- https://supabase.com/docs/guides/database/postgres/triggers#dropping-a-trigger
    drop function private.enforce_azure_identity_link_verification() cascade;
end;
$rollback$;

drop function if exists private.enforce_azure_identity_link_verification();

commit;

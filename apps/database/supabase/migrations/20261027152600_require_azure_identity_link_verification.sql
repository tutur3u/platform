-- SR-354: require explicit Microsoft email-domain verification when linking.
-- GoTrue v2.197.0 azure.go:156 delegates to oidc.go:329; the raw xms_edov
-- claim survives in identity_data.custom_claims (provider.go:115,
-- external.go:310). oidc.go:279 treats an absent claim as email_verified,
-- so email_verified alone is not proof. Existing signins UPDATE (external.go:383).
begin;

create function private.enforce_azure_identity_link_verification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
begin
    if exists (
        select 1
        from auth.identities as existing
        where existing.user_id = new.user_id
            and existing.provider <> 'azure'
    ) and not coalesce(
        (new.identity_data #> '{custom_claims,xms_edov}') in (
            'true'::jsonb, '"true"'::jsonb, '"1"'::jsonb
        ),
        false
    ) then
        raise exception using
            errcode = '42501',
            message = 'Microsoft identity linking requires verified email';
    end if;

    return new;
end;
$function$;

alter function private.enforce_azure_identity_link_verification() owner to postgres;
revoke all on function private.enforce_azure_identity_link_verification()
    from public, anon, authenticated;

create trigger enforce_azure_identity_link_verification
    before insert on auth.identities
    for each row
    when (new.provider = 'azure')
    execute function private.enforce_azure_identity_link_verification();

commit;

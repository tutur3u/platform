create or replace function audit.to_record_id(entity_oid oid, pkey_cols text [], rec jsonb) returns uuid stable language sql
set search_path = extensions as $$
select case
        when rec is null then null
        when pkey_cols = array []::text [] then gen_random_uuid()
        else (
            select extensions.uuid_generate_v5(
                    'fd62bc3d-8d6e-43c2-919c-802ba3762271',
                    (
                        jsonb_build_array(to_jsonb($1)) || jsonb_agg($3->>key_)
                    )::text
                )
            from unnest($2) x(key_)
        )
    end $$;
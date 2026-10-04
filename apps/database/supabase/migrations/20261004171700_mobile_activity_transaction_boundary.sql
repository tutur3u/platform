-- Preserve the current authorization/redaction body, including later security patches.
-- Replace the old signature rather than leaving default-argument overload ambiguity.
do $migration$
declare
  old_signature text := 'public.get_wallet_transactions_with_permissions(uuid,uuid,uuid[],uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,text,text,integer,integer,timestamp with time zone,timestamp with time zone,boolean)';
  new_signature text := 'public.get_wallet_transactions_with_permissions(uuid,uuid,uuid[],uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,text,text,integer,integer,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)';
  definition text;
  updated text;
  prior_acl aclitem[];
  prior_owner text;
  grant_entry record;
  prior_comment text;
begin
  select pg_get_functiondef(p.oid), coalesce(p.proacl, acldefault('f', p.proowner)),
    pg_get_userbyid(p.proowner), obj_description(p.oid, 'pg_proc')
  into strict definition, prior_acl, prior_owner, prior_comment
  from pg_proc p where p.oid = old_signature::regprocedure;
  updated := replace(definition, 'p_include_count boolean DEFAULT false)',
    'p_include_count boolean DEFAULT false, p_created_at_until timestamp with time zone DEFAULT NULL)');
  if updated = definition then raise exception 'Unexpected finance RPC argument contract'; end if;
  definition := updated;
  updated := replace(definition,
    'format(''wt.created_at %s'', p_order_direction)',
    'format(''wt.created_at %s, wt.id %s'', p_order_direction, p_order_direction)');
  if updated = definition then raise exception 'Unexpected finance RPC created ordering'; end if;
  definition := updated;
  updated := replace(definition,
    'AND ($12::timestamp with time zone IS NULL OR wt.taken_at <= $12)',
    'AND ($12::timestamp with time zone IS NULL OR wt.taken_at <= $12)
        AND ($25::timestamp with time zone IS NULL OR wt.created_at <= $25)');
  if updated = definition then raise exception 'Unexpected finance RPC date filter'; end if;
  definition := updated;
  updated := replace(definition, 'p_transaction_type;', 'p_transaction_type, p_created_at_until;');
  if updated = definition or
    (length(definition) - length(replace(definition, 'p_transaction_type;', '')))
      / length('p_transaction_type;') <> 2 then
    raise exception 'Unexpected finance RPC dynamic query parameter contract';
  end if;
  execute updated;
  execute format('ALTER FUNCTION %s OWNER TO %I', new_signature, prior_owner);
  execute format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', new_signature);
  -- Clear creation-time default grants before restoring the exact old ACL.
  for grant_entry in select distinct a.grantee
    from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = new_signature::regprocedure loop
    execute format('REVOKE ALL ON FUNCTION %s FROM %s', new_signature,
      case when grant_entry.grantee = 0 then 'PUBLIC'
        else quote_ident(pg_get_userbyid(grant_entry.grantee)) end);
  end loop;
  for grant_entry in select * from aclexplode(prior_acl) loop
    if grant_entry.privilege_type <> 'EXECUTE' then
      raise exception 'Unexpected finance RPC privilege';
    end if;
    execute format('GRANT EXECUTE ON FUNCTION %s TO %s%s', new_signature,
      case when grant_entry.grantee = 0 then 'PUBLIC'
        else quote_ident(pg_get_userbyid(grant_entry.grantee)) end,
      case when grant_entry.is_grantable then ' WITH GRANT OPTION' else '' end);
  end loop;
  execute format('COMMENT ON FUNCTION %s IS %L', new_signature, prior_comment);
  execute format('DROP FUNCTION %s', old_signature);
end
$migration$;
notify pgrst, 'reload schema';

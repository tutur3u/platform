create function private.apply_inventory_season_merge(
 p_ws_id uuid,p_source_id uuid,p_target_id uuid,p_version text,
 p_description_policy text,p_rule_policy text,p_price_policy text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public set lock_timeout='2s' as $$
declare v_preview jsonb; v_receipt private.inventory_season_merges; v_count integer:=0; v_price record; v_segment tstzrange; v_id uuid; v_session private.inventory_season_merge_previews;
 v_now timestamptz:=statement_timestamp(); v_scope text; v_rule_period uuid;
begin
 if p_description_policy is null or p_description_policy not in('source','target') or p_rule_policy is null or p_rule_policy not in('source','target')
  or p_price_policy is null or p_price_policy not in('block','target') or p_version is null then
  raise exception 'Explicit season merge policies and preview are required' using errcode='22023'; end if;
 if not exists(select 1 from public.workspace_members where ws_id=p_ws_id and user_id=p_actor_id) then
  raise exception 'Workspace membership required' using errcode='42501'; end if;
 perform 1 from private.inventory_sales_periods where ws_id=p_ws_id and id in(p_source_id,p_target_id) order by id for update;
 select * into v_receipt from private.inventory_season_merges where ws_id=p_ws_id and source_id=p_source_id;
 if found then
  if v_receipt.actor_id=p_actor_id and (v_receipt.target_id,v_receipt.version,v_receipt.description_policy,v_receipt.rule_policy,v_receipt.price_policy)=(p_target_id,p_version,p_description_policy,p_rule_policy,p_price_policy) then
   return jsonb_build_object('merged',true,'targetId',p_target_id,'importedPriceCount',v_receipt.imported_price_count);
  end if;
  raise exception 'Source period already merged with different choices' using errcode='23514';
 end if;
 select * into v_session from private.inventory_season_merge_previews where id=p_version::uuid and ws_id=p_ws_id
  and actor_id=p_actor_id and source_id=p_source_id and target_id=p_target_id;
 if not found or v_session.expires_at<=clock_timestamp() then raise exception 'Preview expired; refresh' using errcode='40001'; end if;
 v_preview:=private.preview_inventory_season_merge(p_ws_id,p_source_id,p_target_id,p_actor_id,v_session.id,1);
 -- Reject a cutoff schedule that expired while the operator reviewed it.
 if exists(select 1 from private.inventory_product_prices where ws_id=p_ws_id and period_id=p_source_id
  and valid_to>v_session.cutoff and valid_to<=clock_timestamp()) then
  raise exception 'A planned price expired; refresh preview' using errcode='40001'; end if;
 if jsonb_array_length(v_preview->'blockers')>0 or (p_price_policy='block' and (v_preview->>'conflictCount')::bigint>0) then
  raise exception 'Resolve season merge conflicts' using errcode='23514'; end if;
 v_rule_period:=case when p_rule_policy='source' then p_source_id else p_target_id end;
 select product_scope into v_scope from private.inventory_sales_periods where id=v_rule_period and ws_id=p_ws_id;
 if exists(select 1 from private.inventory_product_prices p where p.ws_id=p_ws_id and p.period_id=p_source_id
  and (p.valid_to is null or p.valid_to>v_session.cutoff) and (
   (v_scope='allowlist' and not exists(select 1 from private.inventory_sales_period_products r where r.period_id=v_rule_period and r.product_id=p.product_id and r.ws_id=p_ws_id)) or
   (v_scope='blocklist' and exists(select 1 from private.inventory_sales_period_products r where r.period_id=v_rule_period and r.product_id=p.product_id and r.ws_id=p_ws_id))
  )) then raise exception 'Chosen product rules exclude an imported price product' using errcode='23514'; end if;
 insert into private.inventory_season_merges(ws_id,source_id,target_id,actor_id,version,description_policy,rule_policy,price_policy,preview)
 values(p_ws_id,p_source_id,p_target_id,p_actor_id,p_version,p_description_policy,p_rule_policy,p_price_policy,v_preview);
 insert into private.inventory_season_merge_assignments(merge_source_id,ws_id,sale_source,sale_id,original_period_id,original_assigned_by,original_assigned_at)
 select p_source_id,ws_id,sale_source,sale_id,period_id,assigned_by,assigned_at from private.inventory_sales_period_assignments
 where ws_id=p_ws_id and period_id=p_source_id;
 if p_rule_policy='source' then
  insert into private.inventory_season_merge_rules(merge_source_id,original_period_id,original_product_id,original_product_name,original_created_at)
   select p_source_id,r.period_id,r.product_id,p.name,r.created_at from private.inventory_sales_period_products r
   join public.workspace_products p on p.id=r.product_id where r.ws_id=p_ws_id and r.period_id=p_target_id;
  delete from private.inventory_sales_period_products where ws_id=p_ws_id and period_id=p_target_id;
  insert into private.inventory_sales_period_products(ws_id,period_id,product_id)
   select p_ws_id,p_target_id,product_id from private.inventory_sales_period_products where ws_id=p_ws_id and period_id=p_source_id;
 end if;
 update private.inventory_sales_periods set product_scope=v_scope,
  description=case when p_description_policy='source' then v_preview->'source'->>'description' else description end
  where ws_id=p_ws_id and id=p_target_id;
 -- Import only uncovered future intervals, retaining every original quote ID/value.
 v_now:=clock_timestamp();
 for v_price in select p.*,tstzmultirange(tstzrange(greatest(p.valid_from,v_now),p.valid_to,'[)'))-
  coalesce((select range_agg(tstzrange(t.valid_from,t.valid_to,'[)')) from private.inventory_product_prices t
   where t.ws_id=p_ws_id and t.period_id=p_target_id and (t.product_id,t.unit_id,t.warehouse_id)=(p.product_id,p.unit_id,p.warehouse_id)), '{}'::tstzmultirange) as uncovered
 from private.inventory_product_prices p where p.ws_id=p_ws_id and p.period_id=p_source_id and (p.valid_to is null or p.valid_to>v_now) order by p.id loop
  for v_segment in select unnest(v_price.uncovered) loop
   insert into private.inventory_product_prices(ws_id,period_id,product_id,unit_id,warehouse_id,currency,price,valid_from,valid_to,created_by)
   values(p_ws_id,p_target_id,v_price.product_id,v_price.unit_id,v_price.warehouse_id,v_price.currency,v_price.price,lower(v_segment),upper(v_segment),p_actor_id) returning id into v_id;
   insert into private.inventory_season_merge_prices(merge_source_id,imported_price_id,original_price_id) values(p_source_id,v_id,v_price.id);
   v_count:=v_count+1;
  end loop;
 end loop;
 update private.inventory_sales_period_assignments set period_id=p_target_id,assigned_by=p_actor_id,assigned_at=v_now
  where ws_id=p_ws_id and period_id=p_source_id;
 update private.inventory_sales_periods set status='archived',merged_into_id=p_target_id where ws_id=p_ws_id and id=p_source_id;
 -- Time is validated again before returning the atomic receipt; expiry during
 -- a long import rolls the entire operation back, including all new price IDs.
 if v_session.expires_at<=clock_timestamp() or exists(select 1 from private.inventory_product_prices
  where ws_id=p_ws_id and period_id=p_source_id and valid_to>v_session.cutoff and valid_to<=clock_timestamp()) then
  raise exception 'Review expired during merge; refresh preview' using errcode='40001'; end if;
 update private.inventory_season_merges set imported_price_count=v_count where source_id=p_source_id and ws_id=p_ws_id;
 return jsonb_build_object('merged',true,'targetId',p_target_id,'importedPriceCount',v_count);
end; $$;

create function private.inventory_season_merge_schema_ready() returns boolean language sql stable security definer
 set search_path=pg_catalog,private,public as $$
 select private.inventory_merge_schema_ready() and
  to_regclass('private.inventory_season_merges') is not null and
  to_regclass('private.inventory_season_merge_assignments') is not null and
  to_regclass('private.inventory_season_merge_prices') is not null and
  to_regclass('private.inventory_season_merge_rules') is not null and
  to_regclass('private.inventory_season_merge_previews') is not null and
  to_regprocedure('private.preview_inventory_season_merge(uuid,uuid,uuid,uuid,uuid,integer)') is not null and
  to_regprocedure('private.apply_inventory_season_merge(uuid,uuid,uuid,text,text,text,text,uuid)') is not null and
  (select count(*)=5 from pg_trigger where not tgisinternal and tgenabled='O' and
   ((tgname='inventory_merged_period_guard' and tgrelid='private.inventory_sales_periods'::regclass and tgfoid='private.guard_inventory_merged_period()'::regprocedure) or
    (tgname='inventory_a_season_merge_guard' and tgfoid='private.guard_inventory_merged_period_reference()'::regprocedure and tgrelid in(
     'private.inventory_sales_period_assignments'::regclass,'private.inventory_sales_period_products'::regclass,
     'private.inventory_product_prices'::regclass,'private.inventory_sale_price_snapshots'::regclass))));
$$;
revoke all on function private.apply_inventory_season_merge(uuid,uuid,uuid,text,text,text,text,uuid),private.inventory_season_merge_schema_ready() from public,anon,authenticated;
grant execute on function private.apply_inventory_season_merge(uuid,uuid,uuid,text,text,text,text,uuid),private.inventory_season_merge_schema_ready() to service_role;

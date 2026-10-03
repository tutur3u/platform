-- A shared reference catalog is used for preview, locks and live-only rewiring.
-- Historical records remain attached to the retained source identity.
create function private.inventory_merge_references(p_kind text)
returns table(tbl regclass,col text,historical boolean) language sql stable
set search_path=pg_catalog,private,public as $$
 select distinct c.conrelid::regclass,a.attname::text,
 t.relname in ('finance_invoice_products','product_stock_changes','inventory_checkout_lines',
 'inventory_reservations','inventory_checkout_stock_consumptions','inventory_product_prices',
 'inventory_batch_products','inventory_batches','healthcare_prescription_products')
 from pg_constraint c join pg_class t on t.oid=c.conrelid
 join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
 where c.contype='f' and cardinality(c.conkey)=1
 and c.confrelid=case p_kind when 'product' then 'public.workspace_products'::regclass else 'private.inventory_warehouses'::regclass end;
$$;

create function private.preview_inventory_merge(p_ws_id uuid,p_kind text,p_source_id uuid,p_target_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_source jsonb; v_target jsonb; v_stock jsonb; v_refs jsonb:='[]';
 v_state jsonb:='[]'; v_blockers jsonb:='[]'; v_rows jsonb; r record; ix record;
 v_keys text; v_nonnull text; v_conflicts bigint; v_count bigint; v_plan jsonb;
begin
 if not private.inventory_merge_schema_ready() then
  raise exception 'Inventory merge schema is not ready' using errcode='55000'; end if;
 if p_kind not in ('product','warehouse') or p_source_id=p_target_id then
  raise exception 'Choose two different inventory records' using errcode='22023'; end if;
 if p_kind='product' then
  select to_jsonb(p) into v_source from public.workspace_products p where id=p_source_id and ws_id=p_ws_id;
  select to_jsonb(p) into v_target from public.workspace_products p where id=p_target_id and ws_id=p_ws_id;
 else
  select to_jsonb(p) into v_source from private.inventory_warehouses p where id=p_source_id and ws_id=p_ws_id;
  select to_jsonb(p) into v_target from private.inventory_warehouses p where id=p_target_id and ws_id=p_ws_id;
 end if;
 if v_source is null or v_target is null then raise exception 'Inventory record not found' using errcode='23503'; end if;
 if exists(select 1 from private.inventory_identity_merges where kind=p_kind and source_id in (p_source_id,p_target_id)) then
  raise exception 'Inventory identity was already merged; refresh and select its destination' using errcode='23514'; end if;

 -- Unlimited and finite amounts cannot be added without inventing a conversion.
 -- Differing units have distinct keys and are retained without conversion.
 with s as(select * from private.inventory_products where
  case p_kind when 'product' then product_id else warehouse_id end=p_source_id),
 t as(select * from private.inventory_products where
  case p_kind when 'product' then product_id else warehouse_id end=p_target_id)
 select coalesce(jsonb_agg(jsonb_build_object(
  'productId',case p_kind when 'product' then p_target_id else coalesce(s.product_id,t.product_id) end,
  'warehouseId',case p_kind when 'warehouse' then p_target_id else coalesce(s.warehouse_id,t.warehouse_id) end,
  'unitId',coalesce(s.unit_id,t.unit_id),'sourcePresent',s.product_id is not null,'targetPresent',t.product_id is not null,
  'sourceAmount',s.amount,'targetAmount',t.amount,'sourcePrice',coalesce(s.price,0),'targetPrice',coalesce(t.price,0),
  'sourceMinAmount',coalesce(s.min_amount,0),'targetMinAmount',coalesce(t.min_amount,0),
  'sourceRevenueShareBps',coalesce(s.revenue_share_bps,0),'targetRevenueShareBps',coalesce(t.revenue_share_bps,0),
  'sourceRevenueSharePartnerId',s.revenue_share_partner_id,'targetRevenueSharePartnerId',t.revenue_share_partner_id,
  'conflict',s.product_id is not null and t.product_id is not null and
   (s.price,s.min_amount,s.revenue_share_bps,s.revenue_share_partner_id) is distinct from
   (t.price,t.min_amount,t.revenue_share_bps,t.revenue_share_partner_id)) order by coalesce(s.product_id,t.product_id),coalesce(s.warehouse_id,t.warehouse_id),coalesce(s.unit_id,t.unit_id)),'[]'::jsonb)
 into v_stock from s full join t on s.unit_id=t.unit_id and
  case p_kind when 'product' then s.warehouse_id=t.warehouse_id else s.product_id=t.product_id end;
 if exists(select 1 from jsonb_array_elements(v_stock) x where
  (x->>'sourcePresent')::boolean and (x->>'targetPresent')::boolean and
  (x->'sourceAmount'='null'::jsonb)<>(x->'targetAmount'='null'::jsonb)) then
  v_blockers:=v_blockers||jsonb_build_array('mixed_unlimited_stock'); end if;

 for r in select * from private.inventory_merge_references(p_kind) order by tbl::text,col loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb),count(*) from %s x where %I in ($1,$2)',r.tbl,r.col)
   into v_rows,v_count using p_source_id,p_target_id;
  if exists(select 1 from jsonb_array_elements(v_rows) x where x ? 'ws_id' and x->>'ws_id' is distinct from p_ws_id::text) then
   v_blockers:=v_blockers||jsonb_build_array('cross_workspace_reference'); end if;
  v_state:=v_state||jsonb_build_array(jsonb_build_object('table',r.tbl::text,'column',r.col,'rows',v_rows));
  execute format('select count(*) from %s where %I=$1',r.tbl,r.col) into v_count using p_source_id;
  v_refs:=v_refs||jsonb_build_array(jsonb_build_object('table',r.tbl::text,'count',v_count,'historical',r.historical));
  if v_count=0 then continue; end if;
  if r.tbl='private.inventory_reservations'::regclass then
   execute format('select count(*) from %s where %I=$1 and status=''reserved''',r.tbl,r.col) into v_conflicts using p_source_id;
   if v_conflicts>0 then v_blockers:=v_blockers||jsonb_build_array('active_reservations'); end if;
  end if;
  if r.tbl='private.inventory_checkout_lines'::regclass then
   execute format('select count(*) from %s l join private.inventory_checkout_sessions c on c.id=l.checkout_session_id where l.%I=$1 and c.status=''reserved''',r.tbl,r.col) into v_conflicts using p_source_id;
   if v_conflicts>0 then v_blockers:=v_blockers||jsonb_build_array('active_reservations'); end if;
  end if;
  if r.tbl='private.inventory_product_prices'::regclass then
   execute format('select count(*) from %s where %I=$1 and (valid_to is null or valid_to>now())',r.tbl,r.col) into v_conflicts using p_source_id;
   if v_conflicts>0 then v_blockers:=v_blockers||jsonb_build_array('scheduled_prices'); end if;
  end if;
  if r.historical or r.tbl='private.inventory_products'::regclass then continue; end if;
  -- Check every ordinary unique key that rewiring can collide with. Expression
  -- and partial keys involving this FK require explicit manual resolution.
  for ix in select i.* from pg_index i where i.indrelid=r.tbl and i.indisunique
   and (select attnum from pg_attribute where attrelid=r.tbl and attname=r.col)=any(i.indkey::smallint[]) loop
   if ix.indexprs is not null or ix.indpred is not null then
    v_blockers:=v_blockers||jsonb_build_array('unsupported_unique_key:'||r.tbl::text); continue; end if;
   select string_agg(case when a.attname=r.col then format('%L::text',p_target_id::text) else format('x.%I::text',a.attname) end,', ' order by k.ord),
    string_agg(format('x.%I is not null',a.attname),' and ')
    into v_keys,v_nonnull
    from unnest(ix.indkey::smallint[]) with ordinality k(num,ord)
    join pg_attribute a on a.attrelid=r.tbl and a.attnum=k.num where k.ord<=ix.indnkeyatts;
   execute format('select count(*) from (select 1 from %s x where %I in ($1,$2) and (%s) group by %s having count(*)>1) q',r.tbl,r.col,
    case when ix.indnullsnotdistinct then 'true' else v_nonnull end,v_keys)
    into v_conflicts using p_source_id,p_target_id;
   if v_conflicts>0 then v_blockers:=v_blockers||jsonb_build_array('duplicate_reference:'||r.tbl::text); end if;
  end loop;
 end loop;
 -- References with composite foreign keys are never silently skipped.
 if exists(select 1 from pg_constraint c where c.contype='f' and cardinality(c.conkey)>1 and
 c.confrelid=case p_kind when 'product' then 'public.workspace_products'::regclass else 'private.inventory_warehouses'::regclass end) then
  v_blockers:=v_blockers||jsonb_build_array('unsupported_composite_reference'); end if;
 v_plan:=jsonb_build_object('source',jsonb_build_object('id',p_source_id,'name',v_source->'name','metadata',v_source),
 'target',jsonb_build_object('id',p_target_id,'name',v_target->'name','metadata',v_target),
 'stock',v_stock,'references',v_refs,'blockers',v_blockers);
 return v_plan||jsonb_build_object('version',md5(jsonb_build_array(p_ws_id,p_kind,v_plan,v_state)::text));
end; $$;
revoke all on function private.inventory_merge_references(text),private.preview_inventory_merge(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function private.preview_inventory_merge(uuid,text,uuid,uuid) to service_role;

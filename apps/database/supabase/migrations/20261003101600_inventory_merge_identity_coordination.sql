-- Identity-scoped reader/writer coordination protects the preview/apply snapshot
-- while unrelated identities and workspaces retain ordinary CRUD concurrency.
create function private.inventory_identity_lock_key(p_kind text,p_id uuid)
returns bigint language sql immutable set search_path=pg_catalog as $$
 select hashtextextended('inventory-identity:'||p_kind||':'||p_id::text,0);
$$;
revoke all on function private.inventory_identity_lock_key(text,uuid) from public,anon,authenticated;

create function private.coordinate_inventory_identity_writer() returns trigger
language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_old jsonb:='{}'; v_new jsonb:='{}'; v_key bigint;
begin
 if tg_op<>'INSERT' then v_old:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then v_new:=to_jsonb(new); end if;
 for v_key in
  select distinct private.inventory_identity_lock_key(k.kind,ids.id)
  from (
   select case c.confrelid when 'public.workspace_products'::regclass then 'product' else 'warehouse' end kind,
    a.attname::text col
   from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.conrelid=tg_relid and cardinality(c.conkey)=1
    and c.confrelid in ('public.workspace_products'::regclass,'private.inventory_warehouses'::regclass)
   union select tg_argv[0],'id' where tg_nargs=1
  ) k
  cross join lateral (
   select nullif(v_old->>k.col,'')::uuid id
   union select nullif(v_new->>k.col,'')::uuid
  ) ids where ids.id is not null order by 1
 loop
  if not pg_try_advisory_xact_lock_shared(v_key) then
   raise exception 'Inventory identity is being merged; refresh and retry' using errcode='55P03';
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
revoke all on function private.coordinate_inventory_identity_writer() from public,anon,authenticated;

create trigger inventory_identity_writer before insert or update or delete on public.workspace_products
 for each row execute function private.coordinate_inventory_identity_writer('product');
create trigger inventory_identity_writer before insert or update or delete on private.inventory_warehouses
 for each row execute function private.coordinate_inventory_identity_writer('warehouse');
do $$ declare r record; begin
 for r in select distinct c.conrelid::regclass tbl from pg_constraint c
  where c.contype='f' and c.confrelid in ('public.workspace_products'::regclass,'private.inventory_warehouses'::regclass)
 loop
  execute format('create trigger inventory_identity_writer before insert or update or delete on %s for each row execute function private.coordinate_inventory_identity_writer()',r.tbl);
 end loop;
end $$;

-- Checkout status is a preview blocker even though the session has no inventory FK.
-- A session transition coordinates every identity of its existing line snapshots.
create function private.coordinate_inventory_checkout_writer() returns trigger
language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_key bigint;
begin
 for v_key in
  select distinct private.inventory_identity_lock_key(k.kind,k.id)
  from private.inventory_checkout_lines l
  cross join lateral (values ('product',l.product_id),('warehouse',l.warehouse_id)) k(kind,id)
  where l.checkout_session_id=old.id and k.id is not null order by 1
 loop
  if not pg_try_advisory_xact_lock_shared(v_key) then
   raise exception 'Inventory identity is being merged; refresh and retry' using errcode='55P03'; end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
revoke all on function private.coordinate_inventory_checkout_writer() from public,anon,authenticated;
create trigger inventory_identity_writer before update or delete on private.inventory_checkout_sessions
 for each row execute function private.coordinate_inventory_checkout_writer();

-- APIs must treat a missing readiness RPC as unavailable for NEW merge actions.
-- It is installed last, after restoration and coordination guards, and verifies
-- all required objects. Ordinary warehouse CRUD does not depend on this RPC.
create function private.inventory_merge_schema_ready() returns boolean
language sql stable security definer set search_path=pg_catalog,private,public as $$
 select to_regclass('private.inventory_active_warehouses') is not null
  and to_regclass('private.inventory_identity_merges') is not null
  and to_regclass('private.inventory_invoice_restore_context') is not null
  and exists(select 1 from pg_trigger where tgrelid='public.workspace_products'::regclass
   and tgname='inventory_identity_writer' and tgenabled in ('O','A'))
  and exists(select 1 from pg_trigger where tgrelid='private.inventory_warehouses'::regclass
   and tgname='inventory_identity_writer' and tgenabled in ('O','A'))
  and exists(select 1 from pg_trigger where tgrelid='private.inventory_checkout_sessions'::regclass
   and tgname='inventory_identity_writer' and tgenabled in ('O','A'))
  and exists(select 1 from pg_trigger where tgrelid='public.workspace_products'::regclass
   and tgname='inventory_product_merged_guard' and tgenabled in ('O','A'))
  and exists(select 1 from pg_trigger where tgrelid='private.inventory_warehouses'::regclass
   and tgname='inventory_warehouse_merged_guard' and tgenabled in ('O','A'))
  and not exists(select 1 from pg_constraint c where c.contype='f' and cardinality(c.conkey)=1
   and c.confrelid in ('public.workspace_products'::regclass,'private.inventory_warehouses'::regclass)
   and not exists(select 1 from pg_trigger g where g.tgrelid=c.conrelid
    and g.tgname='inventory_identity_writer' and g.tgenabled in ('O','A')
    and g.tgfoid='private.coordinate_inventory_identity_writer()'::regprocedure))
  and not exists(select 1 from pg_constraint c where c.contype='f' and cardinality(c.conkey)=1
   and c.confrelid in ('public.workspace_products'::regclass,'private.inventory_warehouses'::regclass)
   and not exists(select 1 from pg_trigger g where g.tgrelid=c.conrelid
    and g.tgname='inventory_merged_reference_guard' and g.tgenabled in ('O','A')
    and g.tgfoid='private.reject_merged_inventory_reference()'::regprocedure));
$$;
revoke all on function private.inventory_merge_schema_ready() from public,anon,authenticated;
grant execute on function private.inventory_merge_schema_ready() to service_role;

create or replace function private.preview_inventory_merge(p_ws_id uuid,p_kind text,p_source_id uuid,p_target_id uuid)
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
  if r.historical then
   -- Retained history is never rewired. Only counts and workspace ownership
   -- affect this plan; do not materialize an unbounded history JSON array.
   execute format('select jsonb_build_object(''sourceCount'',count(*) filter(where %I=$1),''targetCount'',count(*) filter(where %I=$2),''crossWorkspace'',coalesce(bool_or(to_jsonb(x) ? ''ws_id'' and to_jsonb(x)->>''ws_id'' is distinct from $3),false)) from %s x where %I in ($1,$2)',r.col,r.col,r.tbl,r.col)
    into v_rows using p_source_id,p_target_id,p_ws_id::text;
   if (v_rows->>'crossWorkspace')::boolean then
    v_blockers:=v_blockers||jsonb_build_array('cross_workspace_reference'); end if;
  else
   execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb) from %s x where %I in ($1,$2)',r.tbl,r.col)
    into v_rows using p_source_id,p_target_id;
   if exists(select 1 from jsonb_array_elements(v_rows) x where x ? 'ws_id' and x->>'ws_id' is distinct from p_ws_id::text) then
    v_blockers:=v_blockers||jsonb_build_array('cross_workspace_reference'); end if;
  end if;
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
   and ((select attnum from pg_attribute where attrelid=r.tbl and attname=r.col)=any(i.indkey::smallint[])
    or exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=i.indexrelid
     and d.refclassid='pg_class'::regclass and d.refobjid=r.tbl
     and d.refobjsubid=(select attnum from pg_attribute where attrelid=r.tbl and attname=r.col))) loop
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

create or replace function private.apply_inventory_merge(
 p_ws_id uuid,p_kind text,p_source_id uuid,p_target_id uuid,p_version text,
 p_metadata_policy text,p_stock_policy text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_preview jsonb; v_receipt private.inventory_identity_merges; r record;
 s private.inventory_products; t private.inventory_products; v_metadata jsonb;
 v_product uuid; v_warehouse uuid; v_key bigint; v_lock_timeout text:=current_setting('lock_timeout');
begin
 if p_metadata_policy is null or p_stock_policy is null or
 p_metadata_policy not in ('source','target') or p_stock_policy not in ('source','target') then
  raise exception 'Review and choose conflict policies' using errcode='22023'; end if;
 if not exists(select 1 from public.workspace_members where ws_id=p_ws_id and user_id=p_actor_id) then
  raise exception 'Workspace access required' using errcode='42501'; end if;
 if not private.inventory_merge_schema_ready() then
  raise exception 'Inventory merge schema is not ready' using errcode='55000'; end if;
 -- Serialize merges within a workspace, including alias chains and retry receipts.
 if not pg_try_advisory_xact_lock(hashtextextended('inventory-merge:'||p_ws_id::text,0)) then
  raise exception 'Inventory merge is busy; refresh and retry' using errcode='55P03'; end if;
 select * into v_receipt from private.inventory_identity_merges where kind=p_kind and source_id=p_source_id;
 if found then
  if v_receipt.ws_id<>p_ws_id or v_receipt.target_id<>p_target_id or
    v_receipt.preview->>'version'<>p_version or v_receipt.metadata_policy<>p_metadata_policy or v_receipt.stock_policy<>p_stock_policy then
   raise exception 'Source already merged with a different decision; refresh' using errcode='23514'; end if;
  return jsonb_build_object('merged',true,'targetId',p_target_id,'replayed',true);
 end if;
 -- Writers share identity locks; merges exclusively reserve their two identities.
 -- Never lock whole reference tables or queue behind another merge/writer.
 for v_key in select distinct private.inventory_identity_lock_key(p_kind,x)
  from unnest(array[p_source_id,p_target_id]) x order by 1 loop
  if not pg_try_advisory_xact_lock(v_key) then
   raise exception 'Inventory identity is busy; refresh and retry' using errcode='55P03'; end if;
 end loop;
 -- Row locks can still contend with pre-trigger tuple locking. Bound each wait;
 -- this is not a current-statement deadline. Restore the caller's setting below.
 perform set_config('lock_timeout','250ms',true);
 if p_kind='product' then
  perform 1 from public.workspace_products where id in(p_source_id,p_target_id) order by id for update;
 else
  perform 1 from private.inventory_warehouses where id in(p_source_id,p_target_id) order by id for update;
 end if;
 v_preview:=private.preview_inventory_merge(p_ws_id,p_kind,p_source_id,p_target_id);
 if v_preview->>'version' is distinct from p_version then
  raise exception 'Inventory changed after preview; review it again' using errcode='23P01'; end if;
 if jsonb_array_length(v_preview->'blockers')>0 then
  raise exception 'Resolve the conflicts shown in the merge preview first' using errcode='23514'; end if;

 for s in select * from private.inventory_products where
  case p_kind when 'product' then product_id else warehouse_id end=p_source_id
  order by product_id,warehouse_id,unit_id loop
  v_product:=case p_kind when 'product' then p_target_id else s.product_id end;
  v_warehouse:=case p_kind when 'warehouse' then p_target_id else s.warehouse_id end;
  select * into t from private.inventory_products where product_id=v_product and warehouse_id=v_warehouse and unit_id=s.unit_id;
  if found then
   update private.inventory_products set
    amount=case when s.amount is null and t.amount is null then null else s.amount+t.amount end,
    price=case p_stock_policy when 'source' then s.price else t.price end,
    min_amount=case p_stock_policy when 'source' then s.min_amount else t.min_amount end,
    revenue_share_bps=case p_stock_policy when 'source' then s.revenue_share_bps else t.revenue_share_bps end,
    revenue_share_partner_id=case p_stock_policy when 'source' then s.revenue_share_partner_id else t.revenue_share_partner_id end
    where product_id=v_product and warehouse_id=v_warehouse and unit_id=s.unit_id;
   delete from private.inventory_products where product_id=s.product_id and warehouse_id=s.warehouse_id and unit_id=s.unit_id;
  else
   update private.inventory_products set product_id=v_product,warehouse_id=v_warehouse
    where product_id=s.product_id and warehouse_id=s.warehouse_id and unit_id=s.unit_id;
  end if;
 end loop;
 -- Rewire live entities only. Quotes, invoices, movements and completed checkout
 -- snapshots retain their original IDs and values; source rows remain readable.
 for r in select * from private.inventory_merge_references(p_kind) where not historical and tbl<>'private.inventory_products'::regclass order by tbl,col loop
  execute format('update %s set %I=$1 where %I=$2',r.tbl,r.col,r.col) using p_target_id,p_source_id;
 end loop;
 v_metadata:=v_preview->case p_metadata_policy when 'source' then 'source' else 'target' end->'metadata';
 if p_kind='product' then
  update public.workspace_products set name=v_metadata->>'name',description=v_metadata->>'description',
   usage=v_metadata->>'usage',avatar_url=v_metadata->>'avatar_url',category_id=(v_metadata->>'category_id')::uuid,
   owner_id=(v_metadata->>'owner_id')::uuid,manufacturer_id=(v_metadata->>'manufacturer_id')::uuid,
   finance_category_id=(v_metadata->>'finance_category_id')::uuid
   where id=p_target_id and ws_id=p_ws_id;
  update public.workspace_products set archived=true where id=p_source_id and ws_id=p_ws_id;
 else
  update private.inventory_warehouses set name=v_metadata->>'name' where id=p_target_id and ws_id=p_ws_id;
 end if;
 insert into private.inventory_identity_merges(ws_id,kind,source_id,target_id,actor_id,preview,metadata_policy,stock_policy)
  values(p_ws_id,p_kind,p_source_id,p_target_id,p_actor_id,v_preview,p_metadata_policy,p_stock_policy);
 insert into private.inventory_audit_logs(ws_id,event_kind,entity_kind,entity_id,entity_label,summary,changed_fields,"before","after",actor_auth_uid,source)
  values(p_ws_id,'updated',p_kind,p_target_id,v_preview->'target'->>'name',
   'Merged inventory identity into destination',array['merged_identity','stock','metadata'],v_preview,
   jsonb_build_object('sourceId',p_source_id,'targetId',p_target_id,'metadataPolicy',p_metadata_policy,'stockPolicy',p_stock_policy),p_actor_id,'live');
 perform set_config('lock_timeout',v_lock_timeout,true);
 return jsonb_build_object('merged',true,'targetId',p_target_id,'replayed',false);
exception when others then
 perform set_config('lock_timeout',v_lock_timeout,true);
 raise;
end; $$;
revoke all on function private.apply_inventory_merge(uuid,text,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function private.apply_inventory_merge(uuid,text,uuid,uuid,text,text,text,uuid) to service_role;

create or replace function private.get_inventory_product_form_options(p_ws_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,private,public as $$
 -- This marker and alias table creation commit atomically in this migration.
 select jsonb_build_object(
 'inventoryMergeSchema','aliases-v1',
 'categories',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public.product_categories x where x.ws_id=p_ws_id),'[]'::jsonb),
 'manufacturers',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from private.inventory_manufacturers x where x.ws_id=p_ws_id),'[]'::jsonb),
 'owners',coalesce((select jsonb_agg(to_jsonb(x) order by x.archived,x.name) from private.inventory_owners x where x.ws_id=p_ws_id),'[]'::jsonb),
 'financeCategories',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public.transaction_categories x where x.ws_id=p_ws_id),'[]'::jsonb),
 'warehouses',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from private.inventory_warehouses x where x.ws_id=p_ws_id
  and not exists(select 1 from private.inventory_identity_merges m where m.kind='warehouse' and m.source_id=x.id)),'[]'::jsonb),
 'units',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from private.inventory_units x where x.ws_id=p_ws_id),'[]'::jsonb));
$$;

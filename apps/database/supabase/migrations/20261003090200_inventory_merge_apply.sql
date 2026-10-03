create function private.apply_inventory_merge(
 p_ws_id uuid,p_kind text,p_source_id uuid,p_target_id uuid,p_version text,
 p_metadata_policy text,p_stock_policy text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_preview jsonb; v_receipt private.inventory_identity_merges; r record;
 s private.inventory_products; t private.inventory_products; v_metadata jsonb;
 v_product uuid; v_warehouse uuid;
begin
 if not private.inventory_merge_schema_ready() then
  raise exception 'Inventory merge schema is not ready' using errcode='55000'; end if;
 if p_metadata_policy not in ('source','target') or p_stock_policy not in ('source','target') then
  raise exception 'Review and choose conflict policies' using errcode='22023'; end if;
 if not exists(select 1 from public.workspace_members where ws_id=p_ws_id and user_id=p_actor_id) then
  raise exception 'Workspace access required' using errcode='42501'; end if;
 -- Serialize merges within a workspace, including alias chains and retry receipts.
 perform pg_advisory_xact_lock(hashtextextended('inventory-merge:'||p_ws_id::text,0));
 select * into v_receipt from private.inventory_identity_merges where kind=p_kind and source_id=p_source_id;
 if found then
  if v_receipt.ws_id<>p_ws_id or v_receipt.target_id<>p_target_id or
    v_receipt.preview->>'version'<>p_version or v_receipt.metadata_policy<>p_metadata_policy or v_receipt.stock_policy<>p_stock_policy then
   raise exception 'Source already merged with a different decision; refresh' using errcode='23514'; end if;
  return jsonb_build_object('merged',true,'targetId',p_target_id,'replayed',true);
 end if;
 -- A bounded inventory maintenance transaction blocks new tuple/reference writes.
 -- Lock every referenced table in OID order, before rows, so preview and apply share
 -- one stable snapshot; lock conflicts fail rather than consume an unbounded queue.
 perform set_config('lock_timeout','3s',true);
 for r in select distinct tbl from private.inventory_merge_references(p_kind) order by tbl loop
  execute format('lock table %s in share row exclusive mode',r.tbl);
 end loop;
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
 return jsonb_build_object('merged',true,'targetId',p_target_id,'replayed',false);
end; $$;
revoke all on function private.apply_inventory_merge(uuid,text,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function private.apply_inventory_merge(uuid,text,uuid,uuid,text,text,text,uuid) to service_role;

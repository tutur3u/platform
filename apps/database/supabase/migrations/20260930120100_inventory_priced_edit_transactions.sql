-- Only authenticated, authorized server routes invoke these private transactions.
create function private.update_inventory_scheduled_period(
 p_ws_id uuid, p_period_id uuid, p_metadata jsonb, p_product_ids jsonb
) returns boolean language plpgsql set search_path=pg_catalog,private,public as $$
declare v_period private.inventory_sales_periods; v_next private.inventory_sales_periods;
begin
 select * into v_period from private.inventory_sales_periods where id=p_period_id and ws_id=p_ws_id for update;
 if not found then return false; end if;
 v_next:=jsonb_populate_record(v_period,p_metadata);
 if p_product_ids is not null and exists(select 1 from jsonb_array_elements_text(p_product_ids) i
   where not exists(select 1 from public.workspace_products p where p.id=i::uuid and p.ws_id=p_ws_id)) then
  raise exception 'Invalid period product workspace' using errcode='23514';
 end if;
 update private.inventory_sales_periods set name=v_next.name,description=v_next.description,
  starts_at=v_next.starts_at,ends_at=v_next.ends_at,time_zone=v_next.time_zone,
  pricing_mode=v_next.pricing_mode,status=v_next.status,product_scope=v_next.product_scope
  where id=p_period_id and ws_id=p_ws_id;
 if p_product_ids is not null or v_next.product_scope='all' then
  delete from private.inventory_sales_period_products where period_id=p_period_id and ws_id=p_ws_id;
  if v_next.product_scope<>'all' then
   insert into private.inventory_sales_period_products(ws_id,period_id,product_id)
    select p_ws_id,p_period_id,i::uuid from jsonb_array_elements_text(coalesce(p_product_ids,'[]'::jsonb)) i;
  end if;
 end if;
 return true;
end; $$;

-- Historical quotes refer to durable product/unit/warehouse identities, not the
-- replaceable inventory row. Edit quantities, tuples, metadata and movement history
-- together so a failed tuple edit cannot leave metadata or a phantom movement.
create function private.edit_inventory_priced_product(
 p_ws_id uuid,p_product_id uuid,p_metadata jsonb,p_inventory jsonb,
 p_workspace_user_id uuid,p_context jsonb,p_record_changes boolean
) returns jsonb language plpgsql set search_path=pg_catalog,private,public as $$
declare
 v_product public.workspace_products; v_next public.workspace_products;
 v_old private.inventory_products; v_row jsonb; v_amount bigint; v_difference bigint;
 v_deleted integer:=0; v_inserted integer:=0; v_updated integer:=0;
begin
 -- Serialize only periods whose quotes reference this product, in stable order.
 perform 1 from private.inventory_sales_periods s where s.ws_id=p_ws_id and exists(
  select 1 from private.inventory_product_prices p where p.period_id=s.id and p.product_id=p_product_id)
  order by s.id for update;
 select * into v_product from public.workspace_products where id=p_product_id and ws_id=p_ws_id for update;
 if not found then raise exception 'Product not found' using errcode='23514'; end if;
 v_next:=jsonb_populate_record(v_product,coalesce(p_metadata,'{}'::jsonb));
 if not exists(select 1 from public.product_categories where id=v_next.category_id and ws_id=p_ws_id)
  or not exists(select 1 from private.inventory_owners where id=v_next.owner_id and ws_id=p_ws_id)
  or (v_next.finance_category_id is not null and not exists(select 1 from public.transaction_categories where id=v_next.finance_category_id and ws_id=p_ws_id))
  or (v_next.manufacturer_id is not null and not exists(select 1 from private.inventory_manufacturers where id=v_next.manufacturer_id and ws_id=p_ws_id)) then
  raise exception 'Invalid product workspace relation' using errcode='23514';
 end if;
 if p_workspace_user_id is not null and not exists(select 1 from public.workspace_users where id=p_workspace_user_id and ws_id=p_ws_id) then
  raise exception 'Invalid stock actor workspace' using errcode='23514';
 end if;
 if nullif(p_context->>'beneficiary_id','') is not null and not exists(select 1 from public.workspace_users where id=(p_context->>'beneficiary_id')::uuid and ws_id=p_ws_id) then
  raise exception 'Invalid stock beneficiary workspace' using errcode='23514';
 end if;
 update public.workspace_products set name=v_next.name,avatar_url=v_next.avatar_url,
  description=v_next.description,usage=v_next.usage,category_id=v_next.category_id,owner_id=v_next.owner_id,
  finance_category_id=v_next.finance_category_id,manufacturer_id=v_next.manufacturer_id,archived=v_next.archived
  where id=p_product_id and ws_id=p_ws_id;
 if p_inventory is null then return '{}'::jsonb; end if;
 if jsonb_typeof(p_inventory)<>'array' or jsonb_array_length(p_inventory)>500 then
  raise exception 'Invalid stock tuple payload' using errcode='23514';
 end if;
 if exists(select 1 from jsonb_array_elements(p_inventory) i group by i->>'unit_id',i->>'warehouse_id' having count(*)>1) then
  raise exception 'Duplicate stock tuple' using errcode='23514';
 end if;
 perform 1 from private.inventory_products where product_id=p_product_id order by unit_id,warehouse_id for update;
 for v_old in select * from private.inventory_products where product_id=p_product_id loop
  if not exists(select 1 from jsonb_array_elements(p_inventory) i where (i->>'unit_id')::uuid=v_old.unit_id and (i->>'warehouse_id')::uuid=v_old.warehouse_id) then
   -- Movement insertion and removal share this transaction, including failure.
   if p_record_changes and p_workspace_user_id is not null and coalesce(v_old.amount,0)<>0 then
    insert into public.product_stock_changes(product_id,unit_id,warehouse_id,amount,creator_id,beneficiary_id,note)
     values(p_product_id,v_old.unit_id,v_old.warehouse_id,-v_old.amount,p_workspace_user_id,(p_context->>'beneficiary_id')::uuid,p_context->>'note');
   end if;
   delete from private.inventory_products where product_id=p_product_id and unit_id=v_old.unit_id and warehouse_id=v_old.warehouse_id;
   v_deleted:=v_deleted+1;
  end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p_inventory) loop
  if not exists(select 1 from private.inventory_units where id=(v_row->>'unit_id')::uuid and ws_id=p_ws_id)
   or not exists(select 1 from private.inventory_warehouses where id=(v_row->>'warehouse_id')::uuid and ws_id=p_ws_id)
   or (nullif(v_row->>'revenue_share_partner_id','') is not null and not exists(select 1 from private.inventory_owners where id=(v_row->>'revenue_share_partner_id')::uuid and ws_id=p_ws_id)) then
   raise exception 'Invalid stock workspace relation' using errcode='23514';
  end if;
  v_amount:=(v_row->>'amount')::bigint;
  if v_amount<0 or (v_row->>'price')::numeric<0 or coalesce((v_row->>'min_amount')::bigint,0)<0 or coalesce((v_row->>'revenue_share_bps')::integer,0) not between 0 and 10000 then
   raise exception 'Invalid stock tuple value' using errcode='23514';
  end if;
  select * into v_old from private.inventory_products where product_id=p_product_id and unit_id=(v_row->>'unit_id')::uuid and warehouse_id=(v_row->>'warehouse_id')::uuid;
  v_difference:=coalesce(v_amount,0)-coalesce(v_old.amount,0);
  if found then
   if (v_old.amount,v_old.price,v_old.min_amount,v_old.revenue_share_partner_id,v_old.revenue_share_bps) is distinct from
    (v_amount,(v_row->>'price')::numeric,coalesce((v_row->>'min_amount')::bigint,0),(v_row->>'revenue_share_partner_id')::uuid,coalesce((v_row->>'revenue_share_bps')::integer,0)) then
    v_updated:=v_updated+1;
   end if;
   update private.inventory_products set amount=v_amount,price=(v_row->>'price')::numeric,min_amount=coalesce((v_row->>'min_amount')::bigint,0),
    revenue_share_partner_id=(v_row->>'revenue_share_partner_id')::uuid,revenue_share_bps=coalesce((v_row->>'revenue_share_bps')::integer,0)
    where product_id=p_product_id and unit_id=v_old.unit_id and warehouse_id=v_old.warehouse_id;
  else
   insert into private.inventory_products(product_id,unit_id,warehouse_id,amount,price,min_amount,revenue_share_partner_id,revenue_share_bps)
    values(p_product_id,(v_row->>'unit_id')::uuid,(v_row->>'warehouse_id')::uuid,v_amount,(v_row->>'price')::numeric,coalesce((v_row->>'min_amount')::bigint,0),(v_row->>'revenue_share_partner_id')::uuid,coalesce((v_row->>'revenue_share_bps')::integer,0));
   v_inserted:=v_inserted+1;
  end if;
  if p_record_changes and p_workspace_user_id is not null and v_difference<>0 then
   insert into public.product_stock_changes(product_id,unit_id,warehouse_id,amount,creator_id,beneficiary_id,note)
    values(p_product_id,(v_row->>'unit_id')::uuid,(v_row->>'warehouse_id')::uuid,v_difference,p_workspace_user_id,(p_context->>'beneficiary_id')::uuid,p_context->>'note');
  end if;
 end loop;
 return jsonb_build_object('deleted',v_deleted,'inserted',v_inserted,'updated',v_updated);
end; $$;
revoke all on function private.update_inventory_scheduled_period(uuid,uuid,jsonb,jsonb),
 private.edit_inventory_priced_product(uuid,uuid,jsonb,jsonb,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function private.update_inventory_scheduled_period(uuid,uuid,jsonb,jsonb),
 private.edit_inventory_priced_product(uuid,uuid,jsonb,jsonb,uuid,jsonb,boolean) to service_role;

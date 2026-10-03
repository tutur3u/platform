-- Preserve period/quote provenance; merging changes future selection and reporting only.
alter table private.inventory_sales_periods add column merged_into_id uuid;
alter table private.inventory_sales_periods add constraint inventory_period_merge_destination
 foreign key (merged_into_id,ws_id) references private.inventory_sales_periods(id,ws_id) deferrable initially deferred;
alter table private.inventory_sales_periods add constraint inventory_period_merge_not_self
 check (merged_into_id is null or merged_into_id<>id);
create table private.inventory_season_merges (
 ws_id uuid not null references public.workspaces(id) on delete cascade,
 source_id uuid primary key,
 target_id uuid not null,
 actor_id uuid not null references auth.users(id),
 version text not null,
 description_policy text not null check(description_policy in ('source','target')),
 rule_policy text not null check(rule_policy in ('source','target')),
 price_policy text not null check(price_policy in ('block','target')),
 preview jsonb not null,
 imported_price_count integer not null default 0,
 created_at timestamptz not null default now(),
 foreign key(source_id,ws_id) references private.inventory_sales_periods(id,ws_id) deferrable initially deferred,
 foreign key(target_id,ws_id) references private.inventory_sales_periods(id,ws_id) deferrable initially deferred
);
alter table private.inventory_season_merges enable row level security;
revoke all on private.inventory_season_merges from public,anon,authenticated;
grant all on private.inventory_season_merges to service_role;

-- Original classification and imported-quote provenance are relational, never giant JSON arrays.
create table private.inventory_season_merge_assignments (
 merge_source_id uuid not null references private.inventory_season_merges(source_id) on delete cascade,
 ws_id uuid not null, sale_source text not null, sale_id uuid not null,
 original_period_id uuid not null, original_assigned_by uuid, original_assigned_at timestamptz not null,
 primary key(merge_source_id,sale_source,sale_id)
);
create table private.inventory_season_merge_rules (
 merge_source_id uuid not null references private.inventory_season_merges(source_id) on delete cascade,
 original_period_id uuid not null, original_product_id uuid not null,
 original_product_name text not null, original_created_at timestamptz not null,
 primary key(merge_source_id,original_product_id)
);
create table private.inventory_season_merge_prices (
 merge_source_id uuid not null references private.inventory_season_merges(source_id) on delete cascade,
 imported_price_id uuid primary key references private.inventory_product_prices(id) deferrable initially deferred,
 original_price_id uuid not null references private.inventory_product_prices(id) deferrable initially deferred
);
create table private.inventory_season_merge_previews (
 id uuid primary key default gen_random_uuid(), ws_id uuid not null references public.workspaces(id) on delete cascade,
 actor_id uuid not null references auth.users(id), source_id uuid not null, target_id uuid not null,
 cutoff timestamptz not null, expires_at timestamptz not null, fingerprint text not null
);
create index inventory_season_merge_preview_owner on private.inventory_season_merge_previews(ws_id,actor_id,expires_at);
alter table private.inventory_season_merge_assignments enable row level security;
alter table private.inventory_season_merge_rules enable row level security;
alter table private.inventory_season_merge_prices enable row level security;
alter table private.inventory_season_merge_previews enable row level security;
revoke all on private.inventory_season_merge_assignments,private.inventory_season_merge_rules,private.inventory_season_merge_prices,private.inventory_season_merge_previews from public,anon,authenticated;
grant all on private.inventory_season_merge_assignments,private.inventory_season_merge_rules,private.inventory_season_merge_prices,private.inventory_season_merge_previews to service_role;

create function private.guard_inventory_merged_period() returns trigger
language plpgsql set search_path=pg_catalog,private,public as $$
begin
 if tg_op='DELETE' and not exists(select 1 from public.workspaces where id=old.ws_id) then return old; end if;
 if old.merged_into_id is not null then
  raise exception 'Sales period was merged; refresh and select its destination' using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if;
 if new.merged_into_id is not null and not exists(
  select 1 from private.inventory_season_merges m where m.ws_id=new.ws_id
   and m.source_id=new.id and m.target_id=new.merged_into_id
 ) then raise exception 'A verified season merge receipt is required' using errcode='23514'; end if;
 return new;
end; $$;
create trigger inventory_merged_period_guard before update or delete on private.inventory_sales_periods
 for each row execute function private.guard_inventory_merged_period();

-- Rule/price writers already lock their parent; this runs before those guards.
-- Assignment and snapshot writers now share those same locks with merge apply.
create function private.guard_inventory_merged_period_reference() returns trigger
language plpgsql set search_path=pg_catalog,private,public as $$
declare v_ws uuid; v_old uuid; v_new uuid;
begin
 v_ws:=case when tg_op='DELETE' then old.ws_id else new.ws_id end;
 if tg_op<>'INSERT' then v_old:=old.period_id; end if;
 if tg_op<>'DELETE' then v_new:=new.period_id; end if;
 if tg_op='DELETE' and not exists(select 1 from public.workspaces where id=v_ws) then return old; end if;
 if tg_op='UPDATE' and old.ws_id is distinct from new.ws_id then
  raise exception 'A period reference cannot change workspace' using errcode='23514'; end if;
 perform 1 from private.inventory_sales_periods where ws_id=v_ws and id in(v_old,v_new) order by id for update;
 if tg_table_name='inventory_sale_price_snapshots' and tg_op<>'INSERT' then
  raise exception 'Captured season quotes are immutable' using errcode='23514'; end if;
 -- Mutable reporting corrections may remove an assignment or keep its identity.
 -- They may never introduce a reference to a merged source, even after waiting.
 if tg_op<>'DELETE' and (tg_op='INSERT' or v_new is distinct from v_old or tg_table_name<>'inventory_sales_period_assignments')
  and exists(select 1 from private.inventory_sales_periods where id=v_new and ws_id=v_ws and merged_into_id is not null) then
  raise exception 'Sales period was merged; refresh and select its destination' using errcode='23514'; end if;
 if tg_op='DELETE' and tg_table_name<>'inventory_sales_period_assignments'
  and exists(select 1 from private.inventory_sales_periods where id=v_old and ws_id=v_ws and merged_into_id is not null) then
  raise exception 'Merged season prices and rules preserve history' using errcode='23514'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
do $$ declare tbl text; begin
 foreach tbl in array array['inventory_sales_period_assignments','inventory_sales_period_products','inventory_product_prices','inventory_sale_price_snapshots'] loop
  execute format('create trigger inventory_a_season_merge_guard before insert or update or delete on private.%I for each row execute function private.guard_inventory_merged_period_reference()',tbl);
 end loop;
end; $$;

-- Constant-memory digests of affected mutable rows; retained immutable quote history
-- contributes ownership counts, never a JSON aggregation of historical records.
create function private.inventory_season_merge_fingerprint(p_ws_id uuid,p_source_id uuid,p_target_id uuid,p_cutoff timestamptz)
returns text language sql stable security definer set search_path=pg_catalog,private,public as $$
 select md5(jsonb_build_object(
 'parents',(select jsonb_agg(to_jsonb(p) order by p.id) from private.inventory_sales_periods p where p.ws_id=p_ws_id and p.id in(p_source_id,p_target_id)),
 'rules',(select jsonb_build_array(count(*),coalesce(sum(hashtextextended(to_jsonb(r)::text,1)::numeric),0),coalesce(sum(hashtextextended(to_jsonb(r)::text,2)::numeric),0)) from private.inventory_sales_period_products r where r.ws_id=p_ws_id and r.period_id in(p_source_id,p_target_id)),
 'planningPrices',(select jsonb_build_array(count(*),coalesce(sum(hashtextextended(to_jsonb(p)::text,3)::numeric),0),coalesce(sum(hashtextextended(to_jsonb(p)::text,4)::numeric),0)) from private.inventory_product_prices p where p.ws_id=p_ws_id and p.period_id in(p_source_id,p_target_id) and (p.valid_to is null or p.valid_to>p_cutoff)),
 'assignments',(select jsonb_build_array(count(*),coalesce(sum(hashtextextended(to_jsonb(a)::text,5)::numeric),0),coalesce(sum(hashtextextended(to_jsonb(a)::text,6)::numeric),0)) from private.inventory_sales_period_assignments a where a.ws_id=p_ws_id and a.period_id in(p_source_id,p_target_id)),
 'retainedPriceCount',(select count(*) from private.inventory_product_prices p where p.ws_id=p_ws_id and p.period_id in(p_source_id,p_target_id) and p.valid_to<=p_cutoff),
 'retainedQuoteCount',(select count(*) from private.inventory_sale_price_snapshots q where q.ws_id=p_ws_id and q.period_id in(p_source_id,p_target_id)),
 'cutoff',p_cutoff)::text);
$$;

create function private.preview_inventory_season_merge(
 p_ws_id uuid,p_source_id uuid,p_target_id uuid,p_actor_id uuid,
 p_preview_id uuid default null,p_page integer default 1
) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public set lock_timeout='2s' as $$
declare s private.inventory_sales_periods; t private.inventory_sales_periods;
 v_session private.inventory_season_merge_previews; v_source_rules jsonb; v_target_rules jsonb;
 v_prices jsonb; v_conflicts jsonb; v_price_count bigint; v_conflict_count bigint;
 v_source_rule_count bigint; v_target_rule_count bigint; v_source_excluded bigint; v_target_excluded bigint;
 v_blockers jsonb:='[]'; v_offset integer:=greatest(p_page-1,0)*50; v_reference record;
begin
 if p_source_id is null or p_target_id is null or p_source_id=p_target_id or p_page is null or p_page not between 1 and 100000 then
  raise exception 'Select two different periods and a valid review page' using errcode='22023'; end if;
 if not exists(select 1 from public.workspace_members where ws_id=p_ws_id and user_id=p_actor_id) then
  raise exception 'Workspace membership required' using errcode='42501'; end if;
 perform 1 from private.inventory_sales_periods where ws_id=p_ws_id and id in(p_source_id,p_target_id) order by id for update;
 select * into s from private.inventory_sales_periods where ws_id=p_ws_id and id=p_source_id;
 if not found then raise exception 'Source period not found' using errcode='23503'; end if;
 select * into t from private.inventory_sales_periods where ws_id=p_ws_id and id=p_target_id;
 if not found then raise exception 'Destination period not found' using errcode='23503'; end if;
 if s.merged_into_id is not null or t.merged_into_id is not null then
  raise exception 'Period already merged; select its destination' using errcode='23514'; end if;
 if p_preview_id is null then
  delete from private.inventory_season_merge_previews where id in(
   select id from private.inventory_season_merge_previews where ws_id=p_ws_id and actor_id=p_actor_id and expires_at<clock_timestamp() order by expires_at limit 1000);
  insert into private.inventory_season_merge_previews(ws_id,actor_id,source_id,target_id,cutoff,expires_at,fingerprint)
  values(p_ws_id,p_actor_id,p_source_id,p_target_id,statement_timestamp(),statement_timestamp()+interval '5 minutes',
   private.inventory_season_merge_fingerprint(p_ws_id,p_source_id,p_target_id,statement_timestamp())) returning * into v_session;
 else
  select * into v_session from private.inventory_season_merge_previews where id=p_preview_id and ws_id=p_ws_id and actor_id=p_actor_id and source_id=p_source_id and target_id=p_target_id;
  if not found or v_session.expires_at<=clock_timestamp() then raise exception 'Preview expired; refresh' using errcode='40001'; end if;
  if v_session.fingerprint is distinct from private.inventory_season_merge_fingerprint(p_ws_id,p_source_id,p_target_id,v_session.cutoff) then
   raise exception 'Season changed; refresh preview' using errcode='40001'; end if;
 end if;
 if t.status<>'active' then v_blockers:=v_blockers||'"inactive_destination"'::jsonb; end if;
 select count(*) into v_source_rule_count from private.inventory_sales_period_products where period_id=s.id and ws_id=p_ws_id;
 select count(*) into v_target_rule_count from private.inventory_sales_period_products where period_id=t.id and ws_id=p_ws_id;
 select coalesce(jsonb_agg(rule order by product_id),'[]') into v_source_rules from (
  select r.product_id,jsonb_build_object('id',r.product_id,'name',p.name) rule from private.inventory_sales_period_products r
  join public.workspace_products p on p.id=r.product_id where r.period_id=s.id and r.ws_id=p_ws_id order by r.product_id limit 50 offset v_offset) bounded;
 select coalesce(jsonb_agg(rule order by product_id),'[]') into v_target_rules from (
  select r.product_id,jsonb_build_object('id',r.product_id,'name',p.name) rule from private.inventory_sales_period_products r
  join public.workspace_products p on p.id=r.product_id where r.period_id=t.id and r.ws_id=p_ws_id order by r.product_id limit 50 offset v_offset) bounded;
 select count(*) filter(where (s.product_scope='allowlist' and not exists(select 1 from private.inventory_sales_period_products r where r.period_id=s.id and r.ws_id=p_ws_id and r.product_id=p.product_id))
  or (s.product_scope='blocklist' and exists(select 1 from private.inventory_sales_period_products r where r.period_id=s.id and r.ws_id=p_ws_id and r.product_id=p.product_id))),
 count(*) filter(where (t.product_scope='allowlist' and not exists(select 1 from private.inventory_sales_period_products r where r.period_id=t.id and r.ws_id=p_ws_id and r.product_id=p.product_id))
  or (t.product_scope='blocklist' and exists(select 1 from private.inventory_sales_period_products r where r.period_id=t.id and r.ws_id=p_ws_id and r.product_id=p.product_id)))
 into v_source_excluded,v_target_excluded from private.inventory_product_prices p where p.period_id=s.id and p.ws_id=p_ws_id and (p.valid_to is null or p.valid_to>v_session.cutoff);
 select count(*) into v_price_count from private.inventory_product_prices p where p.period_id=s.id and p.ws_id=p_ws_id and (p.valid_to is null or p.valid_to>v_session.cutoff);
 select coalesce(jsonb_agg(price order by id),'[]') into v_prices from (
  select p.id,jsonb_build_object('id',p.id,'productId',p.product_id,'productName',product.name,'unitId',p.unit_id,'unitName',unit.name,
   'warehouseId',p.warehouse_id,'warehouseName',warehouse.name,'currency',p.currency,'price',p.price,'validFrom',p.valid_from,'validTo',p.valid_to) as price
  from private.inventory_product_prices p join public.workspace_products product on product.id=p.product_id
  join private.inventory_units unit on unit.id=p.unit_id join private.inventory_warehouses warehouse on warehouse.id=p.warehouse_id
  where p.period_id=s.id and p.ws_id=p_ws_id and (p.valid_to is null or p.valid_to>v_session.cutoff) order by p.id limit 50 offset v_offset
 ) bounded;
 with conflicts as (
  select a.id aid,b.id bid,jsonb_build_object('sourcePriceId',a.id,'targetPriceId',b.id,'productId',a.product_id,
   'productName',product.name,'unitName',unit.name,'warehouseName',warehouse.name,'sourcePrice',a.price,'targetPrice',b.price,
   'sourceCurrency',a.currency,'targetCurrency',b.currency,'sourceFrom',a.valid_from,'sourceTo',a.valid_to,'targetFrom',b.valid_from,'targetTo',b.valid_to) as conflict
  from private.inventory_product_prices a join private.inventory_product_prices b
   on b.period_id=t.id and b.ws_id=p_ws_id and (a.product_id,a.unit_id,a.warehouse_id)=(b.product_id,b.unit_id,b.warehouse_id)
   and tstzrange(greatest(a.valid_from,v_session.cutoff),a.valid_to,'[)')&&tstzrange(b.valid_from,b.valid_to,'[)')
  join public.workspace_products product on product.id=a.product_id join private.inventory_units unit on unit.id=a.unit_id
  join private.inventory_warehouses warehouse on warehouse.id=a.warehouse_id
  where a.period_id=s.id and a.ws_id=p_ws_id and (a.valid_to is null or a.valid_to>v_session.cutoff)
 ) select (select count(*) from conflicts),coalesce((select jsonb_agg(conflict order by aid,bid) from(select * from conflicts order by aid,bid limit 50 offset v_offset) bounded),'[]') into v_conflict_count,v_conflicts;
 if v_price_count>0 and (s.pricing_mode,s.starts_at,s.ends_at,s.time_zone) is distinct from (t.pricing_mode,t.starts_at,t.ends_at,t.time_zone) then
  v_blockers:=v_blockers||'"pricing_calendar_mismatch"'::jsonb; end if;
 if exists(select 1 from private.inventory_product_prices p join private.inventory_identity_merges m
  on (m.kind='product' and m.source_id=p.product_id) or (m.kind='warehouse' and m.source_id=p.warehouse_id)
  where p.period_id=s.id and p.ws_id=p_ws_id and (p.valid_to is null or p.valid_to>v_session.cutoff)) then
  v_blockers:=v_blockers||'"merged_stock_identity"'::jsonb; end if;
 for v_reference in select conrelid::regclass::text as tbl from pg_constraint where contype='f' and confrelid='private.inventory_sales_periods'::regclass
  and conrelid not in('private.inventory_sales_periods'::regclass,'private.inventory_season_merges'::regclass,
  'private.inventory_sales_period_assignments'::regclass,'private.inventory_sales_period_products'::regclass,'private.inventory_product_prices'::regclass) loop
  v_blockers:=v_blockers||jsonb_build_array('unsupported_period_reference:'||v_reference.tbl);
 end loop;
 return jsonb_build_object('version',v_session.id,'cutoff',v_session.cutoff,'expiresAt',v_session.expires_at,'page',p_page,
 'source',to_jsonb(s),'target',to_jsonb(t),'sourceRules',v_source_rules,'targetRules',v_target_rules,'sourceRuleCount',v_source_rule_count,'targetRuleCount',v_target_rule_count,
 'sourceRuleConflictCount',v_source_excluded,'targetRuleConflictCount',v_target_excluded,
 'futurePrices',v_prices,'futurePriceCount',v_price_count,'conflicts',v_conflicts,'conflictCount',v_conflict_count,'blockers',v_blockers,
 'hasMore',v_offset+50<greatest(v_price_count,v_conflict_count,v_source_rule_count,v_target_rule_count),
 'assignmentCount',(select count(*) from private.inventory_sales_period_assignments where ws_id=p_ws_id and period_id=s.id),
 'historicalQuoteCount',(select count(*) from private.inventory_sale_price_snapshots where ws_id=p_ws_id and period_id=s.id));
end; $$;

revoke all on function private.guard_inventory_merged_period(),private.guard_inventory_merged_period_reference(),private.inventory_season_merge_fingerprint(uuid,uuid,uuid,timestamptz),private.preview_inventory_season_merge(uuid,uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.guard_inventory_merged_period(),private.guard_inventory_merged_period_reference(),private.inventory_season_merge_fingerprint(uuid,uuid,uuid,timestamptz),private.preview_inventory_season_merge(uuid,uuid,uuid,uuid,uuid,integer) to service_role;

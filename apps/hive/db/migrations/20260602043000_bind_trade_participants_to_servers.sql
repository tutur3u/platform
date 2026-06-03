create unique index if not exists hive_npcs_server_id_id_idx
  on hive_npcs(server_id, id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hive_trade_offers_from_npc_server_fkey'
  ) then
    alter table hive_trade_offers
      add constraint hive_trade_offers_from_npc_server_fkey
      foreign key (server_id, from_npc_id)
      references hive_npcs(server_id, id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hive_trade_offers_to_npc_server_fkey'
  ) then
    alter table hive_trade_offers
      add constraint hive_trade_offers_to_npc_server_fkey
      foreign key (server_id, to_npc_id)
      references hive_npcs(server_id, id)
      on delete cascade
      not valid;
  end if;
end $$;

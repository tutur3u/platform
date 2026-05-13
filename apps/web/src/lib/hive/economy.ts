import type { Json } from '@tuturuuu/types/db';
import type postgres from 'postgres';
import { asHiveJson, getHiveSql } from './hive-db';

type HiveOwnerType = 'npc' | 'warehouse';

type HiveVector = {
  x: number;
  y: number;
  z: number;
};
type HiveTransactionSql = postgres.TransactionSql;

async function addInventoryItem(
  tx: HiveTransactionSql,
  input: {
    itemType: string;
    metadata?: Json;
    ownerId: string;
    ownerType: HiveOwnerType;
    quantity: number;
    serverId: string;
  }
) {
  await tx`
    insert into hive_inventory_items (
      server_id, owner_type, owner_id, item_type, quantity, metadata
    )
    values (
      ${input.serverId},
      ${input.ownerType},
      ${input.ownerId},
      ${input.itemType},
      ${input.quantity},
      ${tx.json(asHiveJson(input.metadata ?? {}))}
    )
    on conflict (server_id, owner_type, owner_id, item_type) do update set
      quantity = hive_inventory_items.quantity + excluded.quantity,
      metadata = hive_inventory_items.metadata || excluded.metadata,
      updated_at = now()
  `;
}

async function removeInventoryItem(
  tx: HiveTransactionSql,
  input: {
    itemType: string;
    ownerId: string;
    ownerType: HiveOwnerType;
    quantity: number;
    serverId: string;
  }
) {
  const [updated] = await tx<Array<{ id: string; quantity: number }>>`
    update hive_inventory_items
    set quantity = quantity - ${input.quantity},
      updated_at = now()
    where server_id = ${input.serverId}
      and owner_type = ${input.ownerType}
      and owner_id = ${input.ownerId}
      and item_type = ${input.itemType}
      and quantity >= ${input.quantity}
    returning id, quantity
  `;

  if (!updated) {
    throw new Error('Insufficient inventory quantity');
  }

  if (updated.quantity <= 0) {
    await tx`delete from hive_inventory_items where id = ${updated.id}`;
  }
}

export async function runHiveFarmingAction(input: {
  action: 'harvest' | 'plant' | 'water';
  actorUserId: string;
  cropId?: string;
  cropType?: string;
  npcId?: string;
  position?: HiveVector;
  serverId: string;
}) {
  const sql = getHiveSql();

  return sql.begin(async (tx) => {
    if (input.action === 'plant') {
      const [crop] = await tx`
        insert into hive_crop_instances (
          server_id, crop_type, position, planted_by_npc_id
        )
        values (
          ${input.serverId},
          ${input.cropType ?? 'turnip'},
          ${tx.json(asHiveJson(input.position ?? { x: 0, y: 1, z: 0 }))},
          ${input.npcId ?? null}
        )
        returning id, crop_type, position, growth_stage, max_growth_stage,
          needs_water, health, planted_at, ready_at
      `;

      return { crop, reward: 0 };
    }

    if (!input.cropId) {
      throw new Error('cropId is required');
    }

    if (input.action === 'water') {
      const [crop] = await tx`
        update hive_crop_instances
        set needs_water = false,
          watered_at = now(),
          health = least(100, health + 5)
        where id = ${input.cropId}
          and server_id = ${input.serverId}
          and harvested_at is null
        returning id, crop_type, position, growth_stage, max_growth_stage,
          needs_water, health, watered_at, ready_at
      `;

      if (!crop) throw new Error('Crop not found');
      return { crop, reward: 0 };
    }

    const [crop] = await tx<Array<{ crop_type: string; id: string }>>`
      update hive_crop_instances
      set harvested_at = now()
      where id = ${input.cropId}
        and server_id = ${input.serverId}
        and harvested_at is null
        and growth_stage >= max_growth_stage
      returning id, crop_type
    `;

    if (!crop) {
      throw new Error('Crop is not ready to harvest');
    }

    const reward = 8;
    if (input.npcId) {
      await addInventoryItem(tx, {
        itemType: crop.crop_type,
        ownerId: input.npcId,
        ownerType: 'npc',
        quantity: 3,
        serverId: input.serverId,
      });

      await tx`
        update hive_npc_wallets
        set balance = balance + ${reward},
          updated_at = now()
        where npc_id = ${input.npcId}
      `;
      await tx`
        insert into hive_ledger_entries (
          server_id, actor_npc_id, amount, reason, metadata
        )
        values (
          ${input.serverId},
          ${input.npcId},
          ${reward},
          'crop_harvest_reward',
          ${tx.json(asHiveJson({ cropId: crop.id, cropType: crop.crop_type }))}
        )
      `;
      await tx`
        update hive_servers
        set total_currency = total_currency + ${reward},
          updated_at = now()
        where id = ${input.serverId}
      `;
    }

    return { crop, reward };
  });
}

export async function listHiveLedgerEntries(serverId: string) {
  const sql = getHiveSql();
  return sql`
    select id, actor_npc_id, counterparty_npc_id, amount, reason, metadata,
      created_at
    from hive_ledger_entries
    where server_id = ${serverId}
    order by created_at desc
    limit 100
  `;
}

export async function createHiveWarehouse(input: {
  capacity?: number;
  name: string;
  position: HiveVector;
  serverId: string;
}) {
  const sql = getHiveSql();
  const [warehouse] = await sql`
    insert into hive_warehouses (server_id, name, position, capacity)
    values (
      ${input.serverId},
      ${input.name},
      ${sql.json(asHiveJson(input.position))},
      ${input.capacity ?? 500}
    )
    returning id, name, position, capacity, created_at
  `;
  return warehouse ?? null;
}

export async function transferHiveInventory(input: {
  fromOwnerId: string;
  fromOwnerType: HiveOwnerType;
  itemType: string;
  quantity: number;
  serverId: string;
  toOwnerId: string;
  toOwnerType: HiveOwnerType;
}) {
  const sql = getHiveSql();
  return sql.begin(async (tx) => {
    await removeInventoryItem(tx, {
      itemType: input.itemType,
      ownerId: input.fromOwnerId,
      ownerType: input.fromOwnerType,
      quantity: input.quantity,
      serverId: input.serverId,
    });
    await addInventoryItem(tx, {
      itemType: input.itemType,
      ownerId: input.toOwnerId,
      ownerType: input.toOwnerType,
      quantity: input.quantity,
      serverId: input.serverId,
    });

    return { transferred: true };
  });
}

export async function createHiveTradeOffer(input: {
  expiresAt?: string | null;
  fromNpcId: string;
  offeredCurrency: number;
  offeredItems: Json;
  requestedCurrency: number;
  requestedItems: Json;
  serverId: string;
  toNpcId?: string | null;
}) {
  const sql = getHiveSql();
  const [trade] = await sql`
    insert into hive_trade_offers (
      server_id, from_npc_id, to_npc_id, offered_items, requested_items,
      offered_currency, requested_currency, expires_at
    )
    values (
      ${input.serverId},
      ${input.fromNpcId},
      ${input.toNpcId ?? null},
      ${sql.json(asHiveJson(input.offeredItems))},
      ${sql.json(asHiveJson(input.requestedItems))},
      ${input.offeredCurrency},
      ${input.requestedCurrency},
      ${input.expiresAt ?? null}
    )
    returning id, from_npc_id, to_npc_id, offered_items, requested_items,
      offered_currency, requested_currency, status, expires_at, created_at
  `;
  return trade ?? null;
}

export async function acceptHiveTradeOffer(input: {
  tradeId: string;
  acceptingNpcId: string;
  serverId: string;
}) {
  const sql = getHiveSql();

  return sql.begin(async (tx) => {
    const [trade] = await tx<
      Array<{
        from_npc_id: string;
        offered_currency: string;
        requested_currency: string;
        status: string;
        to_npc_id: string | null;
      }>
    >`
      select from_npc_id, to_npc_id, offered_currency, requested_currency,
        status
      from hive_trade_offers
      where id = ${input.tradeId} and server_id = ${input.serverId}
      for update
    `;

    if (!trade || trade.status !== 'open') {
      throw new Error('Trade offer is not open');
    }

    if (trade.to_npc_id && trade.to_npc_id !== input.acceptingNpcId) {
      throw new Error('Trade offer is not addressed to this NPC');
    }

    const offered = Number(trade.offered_currency);
    const requested = Number(trade.requested_currency);

    const [fromWallet] = await tx<Array<{ balance: string }>>`
      select balance
      from hive_npc_wallets
      where npc_id = ${trade.from_npc_id}
      for update
    `;
    const [toWallet] = await tx<Array<{ balance: string }>>`
      select balance
      from hive_npc_wallets
      where npc_id = ${input.acceptingNpcId}
      for update
    `;

    if (!fromWallet || !toWallet) throw new Error('Trade wallet missing');
    if (Number(fromWallet.balance) < offered) {
      throw new Error('Offering NPC has insufficient currency');
    }
    if (Number(toWallet.balance) < requested) {
      throw new Error('Accepting NPC has insufficient currency');
    }

    await tx`
      update hive_npc_wallets
      set balance = balance - ${offered} + ${requested},
        updated_at = now()
      where npc_id = ${trade.from_npc_id}
    `;
    await tx`
      update hive_npc_wallets
      set balance = balance + ${offered} - ${requested},
        updated_at = now()
      where npc_id = ${input.acceptingNpcId}
    `;
    await tx`
      update hive_trade_offers
      set status = 'accepted',
        to_npc_id = coalesce(to_npc_id, ${input.acceptingNpcId}),
        updated_at = now()
      where id = ${input.tradeId}
    `;
    await tx`
      insert into hive_ledger_entries (
        server_id, actor_npc_id, counterparty_npc_id, amount, reason, metadata
      )
      values (
        ${input.serverId},
        ${trade.from_npc_id},
        ${input.acceptingNpcId},
        ${requested - offered},
        'trade_settlement',
        ${tx.json(asHiveJson({ tradeId: input.tradeId }))}
      )
    `;

    return { accepted: true };
  });
}

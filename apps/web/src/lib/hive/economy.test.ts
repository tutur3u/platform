import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptHiveTradeOffer, createHiveTradeOffer } from './economy';

const SERVER_ID = '00000000-0000-4000-8000-000000000010';
const FROM_NPC_ID = '00000000-0000-4000-8000-000000000001';
const TO_NPC_ID = '00000000-0000-4000-8000-000000000002';
const TRADE_ID = '00000000-0000-4000-8000-000000000003';

const mocks = vi.hoisted(() => ({
  getHiveSql: vi.fn(),
  queries: [] as { text: string; values: unknown[] }[],
}));

type MockSqlTag = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  json: (value: unknown) => unknown;
};

type MockRootSql = MockSqlTag & {
  begin: <T>(handler: (tx: MockSqlTag) => Promise<T>) => Promise<T>;
};

vi.mock('./hive-db', () => ({
  asHiveJson: (value: unknown) => value,
  getHiveSql: (...args: unknown[]) => mocks.getHiveSql(...args),
}));

function createMockSql(results: unknown[][]) {
  const tx = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    mocks.queries.push({
      text: Array.from(strings).join('?'),
      values,
    });
    return Promise.resolve(results.shift() ?? []);
  }) as unknown as MockSqlTag;
  tx.json = (value: unknown) => value;

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    mocks.queries.push({
      text: Array.from(strings).join('?'),
      values,
    });
    return Promise.resolve(results.shift() ?? []);
  }) as unknown as MockRootSql;
  sql.json = (value: unknown) => value;
  sql.begin = (handler) => handler(tx);

  return sql;
}

describe('Hive economy trades', () => {
  beforeEach(() => {
    mocks.queries.length = 0;
    mocks.getHiveSql.mockReset();
  });

  it('validates trade participants against the route server before insert', async () => {
    mocks.getHiveSql.mockReturnValue(
      createMockSql([
        [{ id: FROM_NPC_ID }],
        [{ id: TO_NPC_ID }],
        [{ id: TRADE_ID }],
      ])
    );

    await createHiveTradeOffer({
      expiresAt: null,
      fromNpcId: FROM_NPC_ID,
      offeredCurrency: 10,
      offeredItems: [],
      requestedCurrency: 5,
      requestedItems: [],
      serverId: SERVER_ID,
      toNpcId: TO_NPC_ID,
    });

    const npcChecks = mocks.queries.filter(({ text }) =>
      text.includes('from hive_npcs')
    );
    expect(npcChecks).toHaveLength(2);
    expect(npcChecks.every(({ text }) => text.includes('server_id = ?'))).toBe(
      true
    );
    expect(npcChecks.every(({ values }) => values.includes(SERVER_ID))).toBe(
      true
    );
  });

  it('rejects trade creation when the offering NPC is outside the server', async () => {
    mocks.getHiveSql.mockReturnValue(createMockSql([[]]));

    await expect(
      createHiveTradeOffer({
        expiresAt: null,
        fromNpcId: FROM_NPC_ID,
        offeredCurrency: 10,
        offeredItems: [],
        requestedCurrency: 5,
        requestedItems: [],
        serverId: SERVER_ID,
        toNpcId: TO_NPC_ID,
      })
    ).rejects.toThrow('Offering NPC not found');

    expect(
      mocks.queries.some(({ text }) =>
        text.includes('insert into hive_trade_offers')
      )
    ).toBe(false);
  });

  it('locks and updates trade wallets through server-bound NPC joins', async () => {
    mocks.getHiveSql.mockReturnValue(
      createMockSql([
        [
          {
            from_npc_id: FROM_NPC_ID,
            offered_currency: '10',
            requested_currency: '5',
            status: 'open',
            to_npc_id: null,
          },
        ],
        [{ id: FROM_NPC_ID }],
        [{ id: TO_NPC_ID }],
        [{ balance: '100' }],
        [{ balance: '100' }],
        [{ npc_id: FROM_NPC_ID }],
        [{ npc_id: TO_NPC_ID }],
        [],
        [],
      ])
    );

    await acceptHiveTradeOffer({
      acceptingNpcId: TO_NPC_ID,
      serverId: SERVER_ID,
      tradeId: TRADE_ID,
    });

    const walletReads = mocks.queries.filter(({ text }) =>
      text.includes('from hive_npc_wallets wallets')
    );
    expect(walletReads).toHaveLength(2);
    expect(
      walletReads.every(({ text, values }) => {
        return (
          text.includes('join hive_npcs npcs on npcs.id = wallets.npc_id') &&
          text.includes('npcs.server_id = ?') &&
          values.includes(SERVER_ID)
        );
      })
    ).toBe(true);

    const walletUpdates = mocks.queries.filter(({ text }) =>
      text.includes('update hive_npc_wallets wallets')
    );
    expect(walletUpdates).toHaveLength(2);
    expect(
      walletUpdates.every(({ text, values }) => {
        return (
          text.includes('from hive_npcs npcs') &&
          text.includes('npcs.server_id = ?') &&
          values.includes(SERVER_ID)
        );
      })
    ).toBe(true);
  });
});

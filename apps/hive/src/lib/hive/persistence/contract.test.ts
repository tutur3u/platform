import { describe, expect, it } from 'vitest';
import { FakeHivePersistence } from './__tests__/fake-persistence';
import {
  type HiveTradeCommand,
  type HiveWorldEventCommand,
  hiveOperationIdSchema,
} from './contract';

function world(id = 'world-op'): HiveWorldEventCommand {
  return {
    kind: 'world-event',
    operationId: hiveOperationIdSchema.parse(id),
    writer: { kind: 'world', serverId: 'server-a' },
    actorUserId: 'actor-a',
    eventType: 'block.place',
    researchSessionId: null,
    payload: { reason: 'test-clear' },
    world: {
      blocks: [
        { id: 'block-a', type: 'grass', position: { x: 0, y: 0, z: 0 } },
      ],
      objects: [],
    },
  };
}

function trade(buyer = 'buyer-a'): HiveTradeCommand {
  return {
    kind: 'accept-trade',
    operationId: hiveOperationIdSchema.parse(`trade-${buyer}`),
    writer: { kind: 'economy', serverId: 'server-a' },
    actorUserId: 'actor-a',
    tradeId: buyer,
    acceptingNpcId: buyer,
  };
}

describe('Hive persistence contract against a fake authoritative writer', () => {
  it('retains the caller ID and commits snapshot, sequence, event and receipt once', async () => {
    const port = new FakeHivePersistence();
    const command = world();
    const first = await port.commit(command);
    expect(first).toMatchObject({
      status: 'committed',
      replayed: false,
      receipt: { operationId: command.operationId, sequence: 1 },
    });
    expect(await port.commit(structuredClone(command))).toEqual({
      ...first,
      replayed: true,
    });
    const state = port.snapshot(command);
    expect(state.world).toEqual(command.world);
    expect(state.sequence).toBe(1);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      actorUserId: command.actorUserId,
      eventType: command.eventType,
      payload: command.payload,
      sequence: 1,
    });
    expect(state.operations.size).toBe(1);
  });

  it('rejects changed immutable input under the same operation ID', async () => {
    const port = new FakeHivePersistence();
    const command = world();
    const receipt = await port.commit(command);
    if (receipt.status !== 'committed')
      throw new Error('Expected initial commit');
    expect(
      await port.commit({ ...command, actorUserId: 'different-actor' })
    ).toEqual({ status: 'rejected', reason: 'operation-conflict' });
    expect(await port.observe(command)).toMatchObject({
      status: 'committed',
      receipt: receipt.receipt,
    });
    expect(port.snapshot(command).events).toHaveLength(1);
  });

  it('compares immutable JSON meaning across optional fields and object key order', async () => {
    const port = new FakeHivePersistence();
    const command = world();
    const [block] = command.world.blocks;
    if (!block) throw new Error('Fixture block missing');
    block.state = undefined;
    await port.commit(command);
    const replay = world();
    const [replayBlock] = replay.world.blocks;
    if (!replayBlock) throw new Error('Replay fixture block missing');
    replayBlock.position = { z: 0, y: 0, x: 0 };
    expect(await port.commit(replay)).toMatchObject({
      status: 'committed',
      replayed: true,
    });
    expect(port.snapshot(command).events).toHaveLength(1);
  });

  it('serializes competing trades and rejects double-spend without a partial ledger', async () => {
    const port = new FakeHivePersistence();
    const first = trade();
    const second = trade('buyer-b');
    port.seed(first);
    const results = await Promise.all([
      port.commit(first),
      port.commit(second),
    ]);
    expect(results.map((r) => r.status)).toEqual(['committed', 'rejected']);
    expect(results[1]).toEqual({
      status: 'rejected',
      reason: 'insufficient-funds',
    });
    const state = port.snapshot(first);
    expect([...state.wallets.values()].reduce((a, b) => a + b, 0n)).toBe(1000n);
    expect(state.wallets.get('seller')).toBe(300n);
    expect(state.wallets.get('buyer-b')).toBe(0n);
    expect(state.trades.get('buyer-b')?.accepted).toBe(false);
    expect(state.ledger).toHaveLength(1);
    expect(await port.commit(first)).toMatchObject({
      status: 'committed',
      replayed: true,
    });
    expect(port.snapshot(first).ledger).toHaveLength(1);
  });

  it('retains an unknown operation after a failed observation and reconciles a lost reply', async () => {
    const port = new FakeHivePersistence();
    const command = trade();
    port.seed(command);
    port.nextFailure = 'after-commit';
    expect(await port.commit(command)).toMatchObject({
      status: 'unknown',
      identity: {
        operationId: command.operationId,
        writer: command.writer,
      },
    });
    expect(
      await port.observe({
        ...command,
        writer: { ...command.writer, serverId: 'other' },
      })
    ).toMatchObject({ status: 'unresolved' });
    expect(await port.observe(command)).toMatchObject({ status: 'committed' });
    expect(await port.commit(command)).toMatchObject({
      status: 'committed',
      replayed: true,
    });
    expect(port.snapshot(command).ledger).toHaveLength(1);
  });

  it('keeps all state unchanged on pre-commit failure and does not infer rejection', async () => {
    const port = new FakeHivePersistence();
    const command = trade();
    port.seed(command);
    const before = port.snapshot(command);
    port.nextFailure = 'before-commit';
    expect(await port.commit(command)).toMatchObject({
      status: 'unknown',
      identity: {
        operationId: command.operationId,
        writer: command.writer,
      },
    });
    expect(await port.observe(command)).toMatchObject({ status: 'unresolved' });
    expect(port.snapshot(command)).toEqual(before);
  });

  it('uses independent sequence/receipt namespaces for independent world writers', async () => {
    const port = new FakeHivePersistence();
    const first = world();
    const other = {
      ...first,
      writer: { ...first.writer, serverId: 'server-b' },
    };
    for (const result of await Promise.all([
      port.commit(first),
      port.commit(other),
    ])) {
      expect(result).toMatchObject({
        status: 'committed',
        receipt: { sequence: 1 },
      });
    }
  });

  it('rejects missing, unstable or oversized caller operation IDs', () => {
    for (const value of ['', 'has whitespace', 'x'.repeat(129)]) {
      expect(hiveOperationIdSchema.safeParse(value).success).toBe(false);
    }
  });
});

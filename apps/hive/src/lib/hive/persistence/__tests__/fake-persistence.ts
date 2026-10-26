import type { HiveWorld } from '../../types';
import type {
  HiveOperationIdentity,
  HiveOperationObservation,
  HivePersistencePort,
  HiveWriteCommand,
  HiveWriteReceipt,
  HiveWriteResult,
} from '../contract';

type Trade = {
  from: string;
  to: string;
  offeredMinor: bigint;
  requestedMinor: bigint;
  accepted: boolean;
};

type State = {
  world: HiveWorld;
  sequence: number;
  events: Array<{
    id: string;
    actorUserId: string;
    eventType: string;
    researchSessionId: string | null;
    sequence: number;
    payload: HiveWorldEventPayload;
  }>;
  wallets: Map<string, bigint>;
  trades: Map<string, Trade>;
  ledger: string[];
  operations: Map<string, { command: string; receipt: HiveWriteReceipt }>;
};

type HiveWorldEventPayload = Extract<
  HiveWriteCommand,
  { kind: 'world-event' }
>['payload'];

function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Unsupported command value');
  return encoded;
}

function scope(identity: HiveOperationIdentity) {
  return `${identity.writer.kind}:${identity.writer.serverId}`;
}

export class FakeHivePersistence implements HivePersistencePort {
  private states = new Map<string, State>();
  private tails = new Map<string, Promise<void>>();
  nextFailure: 'none' | 'before-commit' | 'after-commit' = 'none';

  private state(identity: HiveOperationIdentity) {
    const key = scope(identity);
    let state = this.states.get(key);
    if (!state) {
      state = {
        world: { blocks: [], objects: [] },
        sequence: 0,
        events: [],
        wallets: new Map(),
        trades: new Map(),
        ledger: [],
        operations: new Map(),
      };
      this.states.set(key, state);
    }
    return state;
  }

  seed(identity: HiveOperationIdentity) {
    const state = this.state(identity);
    state.wallets.set('seller', 1000n);
    state.wallets.set('buyer-a', 0n);
    state.wallets.set('buyer-b', 0n);
    for (const buyer of ['buyer-a', 'buyer-b']) {
      state.trades.set(buyer, {
        from: 'seller',
        to: buyer,
        offeredMinor: 700n,
        requestedMinor: 0n,
        accepted: false,
      });
    }
  }

  snapshot(identity: HiveOperationIdentity) {
    return structuredClone(this.state(identity));
  }

  async observe(
    identity: HiveOperationIdentity
  ): Promise<HiveOperationObservation> {
    await this.tails.get(scope(identity));
    const saved = this.state(identity).operations.get(identity.operationId);
    return saved
      ? { status: 'committed', receipt: structuredClone(saved.receipt) }
      : { status: 'unresolved', identity };
  }

  async commit(command: HiveWriteCommand): Promise<HiveWriteResult> {
    const key = scope(command);
    const sealed = structuredClone(command);
    const prior = this.tails.get(key) ?? Promise.resolve();
    const pending = prior.then(() => this.apply(sealed));
    this.tails.set(
      key,
      pending.then(
        () => undefined,
        () => undefined
      )
    );
    return pending;
  }

  private apply(command: HiveWriteCommand): HiveWriteResult {
    const state = this.state(command);
    const fingerprint = canonical(command);
    const saved = state.operations.get(command.operationId);
    if (saved) {
      return saved.command === fingerprint
        ? {
            status: 'committed',
            replayed: true,
            receipt: structuredClone(saved.receipt),
          }
        : { status: 'rejected', reason: 'operation-conflict' };
    }
    const next = structuredClone(state);
    let receipt: HiveWriteReceipt;
    if (command.kind === 'world-event') {
      next.sequence++;
      next.world = structuredClone(command.world);
      const eventId = `event-${next.sequence}`;
      next.events.push({
        id: eventId,
        actorUserId: command.actorUserId,
        eventType: command.eventType,
        researchSessionId: command.researchSessionId,
        sequence: next.sequence,
        payload: structuredClone(command.payload),
      });
      receipt = {
        kind: command.kind,
        operationId: command.operationId,
        writer: command.writer,
        eventId,
        sequence: next.sequence,
      };
    } else {
      const trade = next.trades.get(command.tradeId);
      if (!trade || trade.accepted)
        return { status: 'rejected', reason: 'trade-not-open' };
      if (trade.to !== command.acceptingNpcId)
        return { status: 'rejected', reason: 'wrong-recipient' };
      const from = next.wallets.get(trade.from);
      const to = next.wallets.get(trade.to);
      if (
        from === undefined ||
        to === undefined ||
        from < trade.offeredMinor ||
        to < trade.requestedMinor
      ) {
        return { status: 'rejected', reason: 'insufficient-funds' };
      }
      next.wallets.set(
        trade.from,
        from - trade.offeredMinor + trade.requestedMinor
      );
      next.wallets.set(
        trade.to,
        to + trade.offeredMinor - trade.requestedMinor
      );
      trade.accepted = true;
      const ledgerId = `ledger-${next.ledger.length + 1}`;
      next.ledger.push(ledgerId);
      receipt = {
        kind: command.kind,
        operationId: command.operationId,
        writer: command.writer,
        tradeId: command.tradeId,
        ledgerId,
      };
    }
    next.operations.set(command.operationId, { command: fingerprint, receipt });
    const failure = this.nextFailure;
    this.nextFailure = 'none';
    const identity = {
      operationId: command.operationId,
      writer: command.writer,
    };
    if (failure === 'before-commit') return { status: 'unknown', identity };
    this.states.set(scope(command), next);
    if (failure === 'after-commit') return { status: 'unknown', identity };
    return {
      status: 'committed',
      replayed: false,
      receipt: structuredClone(receipt),
    };
  }
}

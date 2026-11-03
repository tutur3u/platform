import {
  appendSchema,
  canonical,
  type Entry,
  type Head,
  type Keys,
  mac,
  rebuildHoldRegistry,
  sha256,
  verifyChain,
  ZERO_MAC,
} from '../../../packages/meet-core/src/features/meeting-ai/server/erase-ledger';

export interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}
export interface Mirror {
  get(key: string): Promise<string | null>;
  create(key: string, value: string): Promise<void>;
}
export class Ledger {
  constructor(
    private storage: Storage,
    private mirror: Mirror,
    private keys: Keys,
    private version: number,
    private now = () => new Date().toISOString()
  ) {}
  private path(seq: number) {
    return `ledger/${String(seq).padStart(20, '0')}.json`;
  }
  private async finish(entry: Entry) {
    const path = this.path(entry.seq);
    const data = canonical(entry);
    const existing = await this.mirror.get(path);
    if (existing !== null && existing !== data)
      throw Error('LEDGER_MIRROR_CONFLICT');
    if (existing === null) await this.mirror.create(path, data);
    await this.storage.put('head', { seq: entry.seq, mac: entry.mac });
  }
  async append(value: unknown): Promise<Entry> {
    const input = appendSchema.parse(value);
    if (input.ws_id === '42529372-c669-4833-bb32-2cab1f4ffd83')
      throw Error('LEDGER_EC_DENIED');
    if (input.kind === 'intent') {
      const p = input.body.plan;
      if (
        p.ws_id !== input.ws_id ||
        p.meeting_id !== input.meeting_id ||
        p.operation_key !== input.operation_key ||
        (await sha256(canonical(p))) !== input.body.plan_hash
      )
        throw Error('LEDGER_PLAN_MISMATCH');
    } else if (input.kind === 'hold_create' || input.kind === 'hold_release') {
      const b = input.body;
      if (
        b.hold_id !== input.operation_key ||
        b.scope.ws_id !== input.ws_id ||
        b.scope.meeting_id !== input.meeting_id
      )
        throw Error('LEDGER_HOLD_SCOPE');
    }
    await this.finishPending();
    if (
      input.kind === 'outcome' &&
      input.body.state === 'committed' &&
      (await this.storage.get(
        `id:${input.operation_key}:outcome:aborted:cancelled`
      ))
    )
      throw Error('LEDGER_CANCELLED');
    const identity =
      input.kind === 'receipt'
        ? input.body.store
        : input.kind === 'hold_create' || input.kind === 'hold_release'
          ? input.body.transition_id
          : input.kind === 'outcome'
            ? input.body.state === 'aborted'
              ? `aborted:${input.body.reason}`
              : 'committed'
            : 'intent';
    const id = `id:${input.operation_key}:${input.kind}:${identity}`;
    const digest = await sha256(canonical(input));
    const previous = await this.storage.get<{ digest: string; seq: number }>(
      id
    );
    if (previous) {
      if (previous.digest !== digest) throw Error('LEDGER_CONFLICT');
      const e = await this.storage.get<Entry>(this.path(previous.seq));
      if (!e) throw Error('LEDGER_GAP');
      await this.finishPending();
      if ((await this.mirror.get(this.path(e.seq))) !== canonical(e))
        throw Error('LEDGER_MIRROR_CONFLICT');
      return e;
    }
    await this.finishPending();
    const head = await this.head();
    if (!Number.isSafeInteger(head.seq + 1)) throw Error('LEDGER_FULL');
    let body: Entry['body'] = input.body;
    if (input.kind === 'intent' && input.body.plan.document) {
      const blocks = await Promise.all(
        input.body.plan.document.blocks.map(
          async ({ index, block_sha256 }) => ({
            index,
            block_mac: await mac(
              await this.keys(this.version),
              'meet-erase-ledger-block/v1',
              block_sha256,
              ''
            ),
          })
        )
      );
      body = {
        ...input.body,
        plan: {
          ...input.body.plan,
          document: { ...input.body.plan.document, blocks },
        },
      };
    }
    const unsigned = {
      seq: head.seq + 1,
      prev_mac: head.mac,
      kind: input.kind,
      operation_key: input.operation_key,
      ws_id: input.ws_id,
      meeting_id: input.meeting_id,
      at: this.now(),
      key_version: this.version,
      body,
    };
    const entry = {
      ...unsigned,
      mac: await mac(
        await this.keys(this.version),
        'meet-erase-ledger/v1',
        head.mac,
        canonical(unsigned)
      ),
    };
    // A single durable write reserves both bytes and idempotency identity before R2 I/O.
    await this.storage.put('pending', { entry, id, digest });
    await this.finishPending();
    return entry;
  }
  private async finishPending() {
    const pending = await this.storage.get<{
      entry: Entry;
      id: string;
      digest: string;
    }>('pending');
    if (!pending) return;
    const head = await this.head();
    if (pending.entry.seq < head.seq) throw Error('LEDGER_PENDING_INVALID');
    await this.storage.put(this.path(pending.entry.seq), pending.entry);
    await this.storage.put(pending.id, {
      digest: pending.digest,
      seq: pending.entry.seq,
    });
    await this.finish(pending.entry);
  }
  async head(): Promise<Head> {
    return (await this.storage.get<Head>('head')) ?? { seq: 0, mac: ZERO_MAC };
  }
  async verify() {
    const expected = await this.head();
    let head: Head = { seq: 0, mac: ZERO_MAC };
    const holdEvents: Entry[] = [];
    do {
      const page = await this.read(head.seq, 500);
      head = await verifyChain(page.entries, this.keys, undefined, head);
      holdEvents.push(
        ...page.entries.filter(
          (e) => e.kind === 'hold_create' || e.kind === 'hold_release'
        )
      );
    } while (head.seq < expected.seq);
    if (head.seq !== expected.seq || head.mac !== expected.mac)
      throw Error('LEDGER_HEAD_MISMATCH');
    return { head, holds: [...rebuildHoldRegistry(holdEvents).values()] };
  }
  async read(after: number, limit: number) {
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500
    )
      throw Error('LEDGER_PAGE_INVALID');
    const head = await this.head();
    const pending = await this.storage.get<{ entry: Entry }>('pending');
    if (pending && pending.entry.seq > head.seq) throw Error('LEDGER_PENDING');
    const entries: Entry[] = [];
    for (let n = after + 1; n <= Math.min(head.seq, after + limit); n++) {
      const entry = await this.storage.get<Entry>(this.path(n));
      if (!entry || (await this.mirror.get(this.path(n))) !== canonical(entry))
        throw Error('LEDGER_MIRROR_CONFLICT');
      entries.push(entry);
    }
    return { entries, head };
  }
}

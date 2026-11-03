/// <reference path="../worker-configuration.d.ts" />
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import type {
  Append,
  Entry,
  Head,
} from '../../../packages/meet-core/src/features/meeting-ai/server/erase-ledger';
import { Ledger } from './ledger';

type Env = LedgerEnv & { MEET_ERASE_LEDGER_KEY_V1: string };

export class MeetEraseLedger extends DurableObject<Env> {
  private ledger() {
    return new Ledger(
      this.ctx.storage,
      {
        get: async (path) => {
          const object = await this.env.LEDGER_BUCKET.get(path);
          return object ? object.text() : null;
        },
        create: async (path, value) => {
          const result = await this.env.LEDGER_BUCKET.put(path, value, {
            onlyIf: { etagDoesNotMatch: '*' },
          });
          if (!result) throw Error('LEDGER_MIRROR_CONFLICT');
        },
      },
      async (version) => {
        if (version !== 1 || !this.env.MEET_ERASE_LEDGER_KEY_V1)
          throw Error('LEDGER_KEY_UNAVAILABLE');
        const hex = this.env.MEET_ERASE_LEDGER_KEY_V1;
        if (!/^[0-9a-f]{64}$/.test(hex)) throw Error('LEDGER_KEY_UNAVAILABLE');
        return crypto.subtle.importKey(
          'raw',
          Uint8Array.from(hex.match(/../g) ?? [], (h) =>
            Number.parseInt(h, 16)
          ),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign', 'verify']
        );
      },
      1
    );
  }
  verify() {
    return this.ctx.blockConcurrencyWhile(() => this.ledger().verify());
  }
  append(value: Append): Promise<Entry> {
    return this.ctx.blockConcurrencyWhile(() => this.ledger().append(value));
  }
  read(
    after: number,
    limit: number
  ): Promise<{ entries: Entry[]; head: Head }> {
    return this.ctx.blockConcurrencyWhile(() =>
      this.ledger().read(after, limit)
    );
  }
}
// Only the explicitly bound RPC entrypoint grants access. The default export rejects HTTP.
export class EraseLedgerService extends WorkerEntrypoint<Env> {
  private ledger() {
    return this.env.MEET_ERASE_LEDGER.get(
      this.env.MEET_ERASE_LEDGER.idFromName('meet-erase-ledger/v1')
    );
  }
  verify() {
    return this.ledger().verify();
  }
  append(value: Append) {
    return this.ledger().append(value);
  }
  read(after: number, limit: number) {
    return this.ledger().read(after, limit);
  }
}
export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
};

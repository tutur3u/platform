/// <reference path="../worker-configuration.d.ts" />
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import type {
  Append,
  Entry,
  Head,
} from '../../../packages/meet-core/src/features/meeting-ai/server/erase-ledger';
import { Ledger } from './ledger';

type Env = LedgerEnv & {
  MEET_ERASE_LEDGER_KEY_V1: string;
  MEET_AI_PROTECTED_WORKSPACE_IDS: string;
};

export class MeetEraseLedger extends DurableObject<Env> {
  private ledger() {
    const protectedIds = this.env.MEET_AI_PROTECTED_WORKSPACE_IDS?.split(',');
    if (
      !protectedIds?.length ||
      protectedIds.some(
        (id) =>
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
            id
          )
      )
    )
      throw Error('LEDGER_PROTECTED_CONFIG_INVALID');
    return new Ledger(
      this.ctx.storage,
      {
        get: async (path) => {
          const object = await this.env.LEDGER_BUCKET.get(path);
          return object ? object.text() : null;
        },
        hasAfter: async (path) => {
          const page = await this.env.LEDGER_BUCKET.list({
            prefix: 'ledger/',
            startAfter: path,
            limit: 1,
          });
          return page.objects.length > 0;
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
      1,
      protectedIds
    );
  }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = await this.ctx.blockConcurrencyWhile(async () => {
      try {
        return { ok: true as const, value: await fn() };
      } catch (error) {
        return { ok: false as const, error };
      }
    });
    if (!result.ok) throw result.error;
    return result.value;
  }
  private async observed<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const code =
        error instanceof Error && /^LEDGER_[A-Z_]+$/.test(error.message)
          ? error.message
          : 'LEDGER_UNAVAILABLE';
      console.error(JSON.stringify({ code, count: 1 }));
      throw Error(code);
    }
  }
  verify() {
    return this.observed(() =>
      this.ledger().verify((fn) => this.exclusive(fn))
    );
  }
  append(value: Append): Promise<Entry> {
    return this.observed(() =>
      this.exclusive(() => this.ledger().append(value))
    );
  }
  read(
    after: number,
    limit: number
  ): Promise<{ entries: Entry[]; head: Head }> {
    return this.observed(() =>
      this.exclusive(() => this.ledger().read(after, limit))
    );
  }
}
// Only the explicitly bound RPC entrypoint grants access. The default export rejects HTTP.
export class EraseLedgerService extends WorkerEntrypoint<Env> {
  protected ledger() {
    return this.env.MEET_ERASE_LEDGER.get(
      this.env.MEET_ERASE_LEDGER.idFromName('meet-erase-ledger/v1')
    );
  }
  verify() {
    return this.ledger().verify();
  }
  append(value: Append) {
    if (value.kind === 'hold_create' || value.kind === 'hold_release')
      throw Error('LEDGER_HOLD_ENTRYPOINT_REQUIRED');
    return this.ledger().append(value);
  }
  read(after: number, limit: number) {
    return this.ledger().read(after, limit);
  }
}
export class HoldLedgerService extends EraseLedgerService {
  override append(value: Append) {
    if (value.kind !== 'hold_create' && value.kind !== 'hold_release')
      throw Error('LEDGER_HOLD_INPUT_REQUIRED');
    return this.ledger().append(value);
  }
}
export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
};

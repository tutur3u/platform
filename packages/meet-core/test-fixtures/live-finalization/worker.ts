import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { finalizeSessionBilling } from '../../src/cloudflare/live/finalize-billing';
import type { SavedSession } from '../../src/cloudflare/live/session-state';

export class FinalizationFixture {
  constructor(private ctx: DurableObjectState) {}
  async fetch() {
    const receipt = {
      claims: {
        sessionId: 'disposable-session',
        ownerId: 'disposable-owner',
        mode: 'personal',
      },
      ended: true,
      contextErased: true,
      billingFinalized: true,
      billing: { id: 'disposable-bill', settlementComplete: true },
      publicBillings: {},
      journal: { turns: [], checkpoints: [] },
      reviews: [],
    } as unknown as SavedSession;
    await this.ctx.storage.put('session', receipt);
    const count = {
      reads: 0,
      writes: 0,
      lists: 0,
      deletes: 0,
      alarms: 0,
      downstream: 0,
    };
    const storage = {
      get: async (key: string) => {
        count.reads++;
        return this.ctx.storage.get(key);
      },
      put: async (key: string, value: unknown) => {
        count.writes++;
        return this.ctx.storage.put(key, value);
      },
      list: async (options: DurableObjectListOptions) => {
        count.lists++;
        return this.ctx.storage.list(options);
      },
      delete: async (keys: string[]) => {
        count.deletes++;
        return this.ctx.storage.delete(keys);
      },
    } as unknown as DurableObjectStorage;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      count.downstream++;
      throw new Error('Fixture forbids downstream calls');
    }) as typeof fetch;
    try {
      for (let restart = 0; restart < 24; restart++) {
        // Reconstruct from SQLite; these setup reads are included in the total.
        const saved = await storage.get<SavedSession>('session');
        if (!saved) throw new Error('Missing durable receipt');
        await finalizeSessionBilling(
          {} as never,
          saved,
          () => storage.put('session', saved),
          async () => {
            count.alarms++;
          },
          storage
        );
      }
    } finally {
      globalThis.fetch = previousFetch;
    }
    return Response.json({
      count,
      retained: await this.ctx.storage.get('session'),
    });
  }
}
export default {
  fetch(request: Request, env: { FIXTURE: DurableObjectNamespace }) {
    return env.FIXTURE.get(env.FIXTURE.idFromName('isolated-fixture')).fetch(
      request
    );
  },
};

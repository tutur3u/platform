import { DurableObject } from 'cloudflare:workers';
import { ChannelRoomDurableObject } from '../../src/channel-room-do';

export class ChannelRetryFixture extends DurableObject {
  async alarm() {
    await this.ctx.storage.deleteAlarm();
  }
  async fetch(request: Request) {
    const failCompletion =
      new URL(request.url).pathname === '/completion-failure';
    await this.ctx.storage.put('metadata', {
      topic: 'meeting-document-isolated-fixture',
      ownerId: 'owner',
      documentId: 'document',
      checkpointAt: 0,
      version: 0,
    });
    const counts = {
      reads: 0,
      reservations: 0,
      completions: 0,
      provider: 0,
      alarms: 0,
    };
    const storage = {
      get: async (key: string) => {
        counts.reads++;
        return this.ctx.storage.get(key);
      },
      put: async (key: string | Record<string, unknown>, value?: unknown) => {
        if (typeof key === 'string') {
          counts.reservations++;
          await this.ctx.storage.put(key, value);
        } else {
          counts.completions++;
          if (failCompletion) throw new Error('synthetic completion failure');
          await this.ctx.storage.put(key);
        }
      },
      setAlarm: async (at: number) => {
        counts.alarms++;
        await this.ctx.storage.setAlarm(at);
      },
    };
    const state = {
      storage,
      getWebSockets: () => [],
      blockConcurrencyWhile: (run: () => Promise<void>) =>
        this.ctx.blockConcurrencyWhile(run),
    } as unknown as DurableObjectState;
    const room = () =>
      new ChannelRoomDurableObject(state, {
        CHANNEL_ROOM: {} as DurableObjectNamespace,
        MEET_REALTIME_TOKEN_SECRET: 'disposable-channel-fixture-secret',
      });
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      counts.provider++;
      return new Response(null, { status: 503 });
    }) as typeof fetch;
    try {
      for (let i = 0; i < 3; i++) {
        if (i) {
          const metadata = (await this.ctx.storage.get('metadata')) as {
            checkpointAt: number;
          };
          metadata.checkpointAt = Date.now() - 1;
          await this.ctx.storage.put('metadata', metadata);
        }
        try {
          await room().alarm();
        } catch (error) {
          if (
            !failCompletion ||
            !(error instanceof Error) ||
            !error.message.includes('synthetic completion failure')
          )
            throw error;
        }
      }
      const restarted = room();
      await restarted.alarm();
      const before = { ...counts };
      for (let i = 0; i < 100; i++) await restarted.alarm();
      return Response.json({
        before,
        after: counts,
        metadata: await this.ctx.storage.get('metadata'),
      });
    } finally {
      globalThis.fetch = nativeFetch;
      await this.ctx.storage.deleteAlarm();
    }
  }
}
export default {
  async fetch(
    request: Request,
    env: { CHANNEL_RETRY_FIXTURE: DurableObjectNamespace }
  ) {
    return env.CHANNEL_RETRY_FIXTURE.get(
      env.CHANNEL_RETRY_FIXTURE.idFromName(crypto.randomUUID())
    ).fetch(request);
  },
};

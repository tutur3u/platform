import { DurableObject } from 'cloudflare:workers';
import {
  createProgrammingDocument,
  Y,
} from '../../../../packages/realtime/src/collaboration';
import { CollaborationRoomDurableObject } from '../../src/collaboration-room-do';

// Isolated local fixture: production alarm code, real SQLite-backed KV, and a
// failing provider stub. Reconstruct the handler to replay hibernation/restarts.
export class RetryFixture extends DurableObject {
  async alarm() {
    // The fixture invokes the production handler explicitly and closes before
    // its scheduled deadline; this handler only retires stray fixture alarms.
    await this.ctx.storage.deleteAlarm();
  }
  async fetch() {
    const doc = createProgrammingDocument(
      [{ path: 'main.ts', content: 'retained' }],
      'bun main.ts'
    );
    await this.ctx.storage.put({
      'programming-document': Y.encodeStateAsUpdate(doc),
      metadata: {
        ownerId: 'owner',
        resourceId: 'project',
        resource: 'playground',
        roomId: 'room',
        revision: 0,
        checkpointHash: null,
        fileHashes: {},
      },
    });
    doc.destroy();
    const counts = { reads: 0, writes: 0, alarms: 0, provider: 0 };
    const storage = {
      get: async (key: string) => {
        counts.reads++;
        return this.ctx.storage.get(key);
      },
      put: async (key: string, value: unknown) => {
        counts.writes++;
        await this.ctx.storage.put(key, value);
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
      new CollaborationRoomDurableObject(state, {
        COLLABORATION_ROOM: {} as DurableObjectNamespace,
        MEET_REALTIME_TOKEN_SECRET: 'disposable-runtime-fixture',
        PLATFORM_API_BASE_URL: 'https://checkpoint.example.invalid',
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
            checkpointRetry: { nextAt: number };
          };
          metadata.checkpointRetry.nextAt = Date.now() - 1;
          await this.ctx.storage.put('metadata', metadata);
        }
        await room().alarm();
      }
      const before = { ...counts };
      const restarted = room();
      for (let i = 0; i < 100; i++) await restarted.alarm();
      return Response.json({
        before,
        after: counts,
        retained: !!(await this.ctx.storage.get('programming-document')),
      });
    } finally {
      globalThis.fetch = nativeFetch;
      await this.ctx.storage.deleteAlarm();
    }
  }
}
export default {
  async fetch(
    _request: Request,
    env: { RETRY_FIXTURE: DurableObjectNamespace }
  ) {
    return env.RETRY_FIXTURE.get(
      env.RETRY_FIXTURE.idFromName(crypto.randomUUID())
    ).fetch('https://fixture.invalid');
  },
};

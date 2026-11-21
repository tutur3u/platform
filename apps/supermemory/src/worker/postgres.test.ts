import {
  peopleContainerTag,
  peopleCustomId,
} from '@tuturuuu/ai/memory/people-namespace';
import postgres from 'postgres';
import { expect, it } from 'vitest';
import { openMemoryDatabase, runMemoryCommand } from './database';
import { handleMemoryRequest } from './handler';

const adminUrl = process.env.MEMORY_TEST_ADMIN_URL;
const runtimeUrl = process.env.MEMORY_TEST_RUNTIME_URL;

function localTestDatabase(value: string) {
  const uri = new URL(value);
  if (uri.hostname !== '127.0.0.1' || uri.pathname !== '/memory_worker_test') {
    throw new Error(
      'A disposable loopback memory_worker_test database is required'
    );
  }
  return value;
}

it.skipIf(!adminUrl || !runtimeUrl)(
  'enforces real Postgres revisions, purge receipts, tombstones and bounded stop admission',
  async () => {
    if (!adminUrl || !runtimeUrl)
      throw new Error('Test databases are required');
    const admin = postgres(localTestDatabase(adminUrl), { max: 1 });
    const runtime = localTestDatabase(runtimeUrl);
    const peopleSecret = crypto.randomUUID();
    const assistantSecret = crypto.randomUUID();
    const secrets = {
      MEMORY_PEOPLE_CALLER_SECRET: peopleSecret,
      MEMORY_ASSISTANT_CALLER_SECRET: assistantSecret,
    };
    const wsId = crypto.randomUUID();
    const personTag = peopleContainerTag({
      wsId,
      kind: 'person',
      id: crypto.randomUUID(),
    });
    const conversationTag = peopleContainerTag({
      wsId,
      kind: 'conversation',
      id: crypto.randomUUID(),
    });
    const customId = peopleCustomId(wsId, crypto.randomUUID());
    const otherId = peopleCustomId(wsId, crypto.randomUUID());
    const embedding = Array.from({ length: 3072 }, () => 0.125);
    const metadata = {
      ledgerId: customId.split('.').at(-1),
      kind: 'task',
      consentVersion: 3,
      audience: 'manager',
      provenance: { manager: crypto.randomUUID() },
    };
    const queries: string[] = [];

    async function call(path: string, body: object, secret = peopleSecret) {
      queries.length = 0;
      const response = await handleMemoryRequest(
        new Request(new URL(path, 'https://memory.invalid'), {
          headers: { Authorization: `Bearer ${secret}` },
          body: JSON.stringify(body),
          method: 'POST',
        }),
        secrets,
        (caller, command) =>
          runMemoryCommand(
            openMemoryDatabase(runtime, (_id, query) => queries.push(query)),
            caller,
            command
          )
      );
      return { status: response.status, data: await response.json() };
    }

    function dataStatements() {
      return queries.filter((query) =>
        /\b(?:select|insert|update|delete)\b/i.test(query)
      );
    }

    const add = '/v1/memories';
    const read = '/v1/memories/read-by-custom-id';
    const list = '/v1/documents/list';
    const purge = '/v1/memories/purge';
    const addBody = {
      containerTag: personTag,
      customId,
      embedding,
      metadata,
      content: 'original',
    };

    try {
      const [{ stopped, remaining }] = await admin`
        select stopped, remaining from memory_worker.admission where caller = 'people-registry'
      `;
      expect({ stopped, remaining }).toEqual({ stopped: true, remaining: 0 });
      expect(await call(add, addBody)).toEqual({
        status: 503,
        data: { error: 'memory_stopped' },
      });
      expect(dataStatements()).toHaveLength(2);
      expect(await call(add, addBody, assistantSecret)).toEqual({
        status: 403,
        data: { error: 'namespace_denied' },
      });
      expect(queries).toHaveLength(0);
      await admin`update memory_worker.admission set stopped = false, remaining = 40 where caller = 'people-registry'`;

      const original = await call(add, addBody);
      expect(original).toMatchObject({
        status: 200,
        data: { id: expect.any(String), revision: '1' },
      });
      expect(dataStatements()).toHaveLength(8);
      expect(await call(add, addBody)).toEqual(original);
      expect(dataStatements()).toHaveLength(6);
      expect(
        await call(add, { ...addBody, containerTag: conversationTag })
      ).toEqual({
        status: 409,
        data: { error: 'custom_id_conflict' },
      });
      expect(
        await call(read, { containerTag: personTag, customId })
      ).toMatchObject({
        status: 200,
        data: {
          memory: { content: 'original', metadata, revision: '1' },
          snapshotRevision: '1',
        },
      });
      const changed = await call('/v1/memories/update', {
        containerTag: personTag,
        id: original.data.id,
        revision: '1',
        content: 'updated',
        embedding,
      });
      expect(changed).toMatchObject({
        status: 200,
        data: { memory: { content: 'updated', metadata, revision: '2' } },
      });
      expect(
        await call('/v1/search', {
          containerTag: personTag,
          embedding,
          q: 'updated',
        })
      ).toMatchObject({
        status: 200,
        data: { results: [{ id: original.data.id, memory: 'updated' }] },
      });

      const requestId = crypto.randomUUID();
      expect(
        await call(purge, {
          containerTag: personTag,
          expectedRevision: '1',
          requestId,
        })
      ).toEqual({ status: 409, data: { error: 'revision_conflict' } });
      const subset = {
        containerTag: personTag,
        customIds: [customId],
        expectedRevision: '2',
        requestId,
      };
      const receipt = await call(purge, subset);
      expect(receipt).toEqual({
        status: 200,
        data: {
          purged: [customId],
          retained: [],
          complete: true,
          revision: '3',
        },
      });
      expect(dataStatements()).toHaveLength(10);
      expect(await call(purge, subset)).toEqual(receipt);
      expect(dataStatements()).toHaveLength(5);
      expect(await call(read, { containerTag: personTag, customId })).toEqual({
        status: 404,
        data: { error: 'not_found' },
      });
      expect(await call(add, addBody)).toEqual({
        status: 409,
        data: { error: 'memory_retired' },
      });

      const replacement = { ...addBody, customId: otherId };
      expect(await call(add, replacement)).toMatchObject({
        status: 200,
        data: { revision: '4' },
      });
      const replacementConflict = await call(purge, {
        containerTag: personTag,
        customIds: [peopleCustomId(wsId, crypto.randomUUID())],
        expectedRevision: '4',
        requestId: crypto.randomUUID(),
        replacement: { customId: otherId, revision: '3' },
      });
      expect(replacementConflict).toEqual({
        status: 409,
        data: { error: 'replacement_unconfirmed' },
      });
      expect(
        await call(purge, {
          containerTag: personTag,
          expectedRevision: '4',
          requestId: crypto.randomUUID(),
        })
      ).toMatchObject({
        status: 200,
        data: { purged: [otherId], complete: true, revision: '5' },
      });
      expect(
        await call(add, {
          ...addBody,
          customId: peopleCustomId(wsId, crypto.randomUUID()),
        })
      ).toEqual({ status: 409, data: { error: 'memory_retired' } });

      await admin`update memory_worker.admission set stopped = true where caller = 'people-registry'`;
      expect(await call(list, { containerTags: [personTag] })).toEqual({
        status: 503,
        data: { error: 'memory_stopped' },
      });
      expect(dataStatements()).toHaveLength(2);
      await admin`update memory_worker.admission set stopped = false, remaining = 1 where caller = 'people-registry'`;
      expect(await call(list, { containerTags: [personTag] })).toMatchObject({
        status: 200,
      });
      expect(await call(list, { containerTags: [personTag] })).toMatchObject({
        status: 503,
      });
      expect(dataStatements()).toHaveLength(2);

      const [counts] = await admin`
        select
          (select count(*)::int from public.memories where worker_caller = 'people-registry') as memories,
          (select count(*)::int from memory_worker.purge_receipts where caller = 'people-registry') as receipts,
          (select epoch::text from memory_worker.admission where caller = 'people-registry') as epoch
      `;
      expect(counts).toEqual({ memories: 0, receipts: 2, epoch: '3' });
    } finally {
      await admin.end({ timeout: 1 });
    }
  },
  30_000
);

import {
  type CollaborationTicket,
  createProgrammingDocument,
  programmingDocumentSnapshot,
  Y,
} from '@tuturuuu/realtime/collaboration/server';
import assert from 'node:assert/strict';
import { spyOn, test } from 'bun:test';
import {
  buildMiraFixUpdate,
  handleProgrammingMiraFix,
  miraCodeExcerpt,
} from './programming-mira-fix';

const range = { filePath: 'solution.py', startLine: 2, endLine: 2 };
test('patches the exact Yjs range and preserves the other lines', () => {
  const doc = createProgrammingDocument(
    [{ path: range.filePath, content: 'a\nb\nc' }],
    ''
  );
  const excerpt = miraCodeExcerpt(doc, range)!;
  const result = buildMiraFixUpdate(doc, {
    ...excerpt,
    action: 'resolve',
    id: 'fixture',
    decision: 'accepted',
    range,
    replacement: 'x\ny',
  });
  assert.ok(result);
  Y.applyUpdate(doc, result.update);
  assert.equal(
    programmingDocumentSnapshot(doc).files[0]?.content,
    'a\nx\ny\nc'
  );
  doc.destroy();
});
test('rejects stale fixes after a concurrent source edit', () => {
  const doc = createProgrammingDocument(
    [{ path: range.filePath, content: 'a\nb\nc' }],
    ''
  );
  const excerpt = miraCodeExcerpt(doc, range)!;
  doc
    .getMap<Y.Text>('files')
    .get(range.filePath)!
    .insert(0, '# concurrent edit\n');
  assert.equal(
    buildMiraFixUpdate(doc, {
      ...excerpt,
      action: 'resolve',
      id: 'fixture',
      decision: 'accepted',
      range,
      replacement: 'x',
    }),
    null
  );
  doc.destroy();
});

function readFixture(body: ReadableStream<Uint8Array>, exp: number) {
  const doc = createProgrammingDocument(
    [{ path: range.filePath, content: 'a\nb' }],
    ''
  );
  const init: RequestInit & { duplex: 'half' } = {
    body,
    method: 'POST',
    duplex: 'half',
  };
  const request = new Request(
    'https://example.invalid/collaboration/mira-code',
    init
  );
  const ticket = { role: 'owner', exp } as CollaborationTicket;
  return {
    doc,
    response: handleProgrammingMiraFix({
      request,
      ticket,
      doc,
      state: {} as DurableObjectState,
      documentKey: 'fixture',
      publish: async () => assert.fail('Read must not publish'),
    }),
  };
}

test('cancels an oversized stream according to transmitted UTF-8 bytes', async () => {
  let chunks = 0;
  let cancelled = false;
  const bytes = new TextEncoder().encode('é'.repeat(28_000));
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        chunks++;
        controller.enqueue(bytes);
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 }
  );
  const { doc, response } = readFixture(
    body,
    Math.floor(Date.now() / 1000) + 60
  );
  try {
    assert.equal((await response).status, 413);
    assert.equal(chunks, 2);
    assert.ok(cancelled);
  } finally {
    doc.destroy();
  }
});

test('withholds code when the ticket expires while the command body is read', async () => {
  const exp = 2_000_000_000;
  let now = (exp - 1) * 1000;
  const clock = spyOn(Date, 'now').mockImplementation(() => now);
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        now = exp * 1000;
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify({ action: 'read', range }))
        );
        controller.close();
      },
    },
    { highWaterMark: 0 }
  );
  const { doc, response } = readFixture(body, exp);
  try {
    assert.equal((await response).status, 403);
  } finally {
    clock.mockRestore();
    doc.destroy();
  }
});

import { afterEach, expect, it, vi } from 'vitest';
import {
  copyNotebookToDrive,
  notebookCopyLimit,
  notebookExportBlob,
} from './notebook-drive-copy';

afterEach(() => vi.unstubAllGlobals());
const expectedActor = '11111111-1111-4111-8111-111111111111';
const payload = { format: 'lettin-notebook', entries: [] };
function fixture(
  options: {
    deny?: boolean;
    failPut?: boolean;
    failFinalize?: boolean;
    afterStage?: (stage: string) => void;
  } = {}
) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://fixture.example.com').pathname;
    let response: Response;
    let stage: string;
    if (url === '/api/v1/workspaces/workspace/lettin/drive-copy/upload-url') {
      stage = 'url';
      const body = JSON.parse(String(init?.body));
      response = options.deny
        ? Response.json({ error: 'Denied' }, { status: 403 })
        : Response.json({
            signedUrl: 'https://upload.example.com/fixture',
            path: `Lettin/${body.filename}`,
            provider: 'r2',
          });
    } else if (url === '/fixture') {
      stage = 'put';
      response = new Response(null, { status: options.failPut ? 500 : 200 });
    } else if (
      url === '/api/v1/workspaces/workspace/lettin/drive-copy/finalize-upload'
    ) {
      stage = 'finalize';
      response = Response.json(
        options.failFinalize ? { error: 'Index unavailable' } : {},
        { status: options.failFinalize ? 500 : 200 }
      );
    } else throw new Error(`Unexpected fixture transport: ${url}`);
    options.afterStage?.(stage);
    return response;
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('copies JSON through the real same-workspace canonical client with unique non-overwriting names', async () => {
  const fetch = fixture();
  const blob = notebookExportBlob(payload);
  const first = await copyNotebookToDrive(
    'workspace',
    blob,
    () => {},
    expectedActor
  );
  const second = await copyNotebookToDrive(
    'workspace',
    blob,
    () => {},
    expectedActor
  );
  expect(first.finalize?.success).toBe(true);
  expect(second.path).not.toBe(first.path);
  expect(fetch).toHaveBeenCalledTimes(6);
  const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
  expect(body).toEqual({
    expectedActor,
    filename: expect.stringMatching(/^lettin-notebook-[\da-f-]+\.json$/),
    path: 'Lettin',
    upsert: false,
    contentType: 'application/json',
    size: blob.size,
  });
  const put = fetch.mock.calls[1]![1]!;
  expect(put.method).toBe('PUT');
  expect(JSON.parse(await (put.body as File).text())).toEqual(payload);
  expect(JSON.parse(String(fetch.mock.calls[2]![1]?.body))).toEqual({
    expectedActor,
    provider: 'r2',
    path: first.path,
    contentType: 'application/json',
    originalFilename: body.filename,
  });
});
it('rejects oversized or non-JSON copies before any transport', async () => {
  const fetch = fixture();
  await expect(
    copyNotebookToDrive(
      'workspace',
      new Blob(['text']),
      () => {},
      expectedActor
    )
  ).rejects.toThrow('Invalid notebook copy');
  await expect(
    copyNotebookToDrive(
      'workspace',
      new Blob(['a'.repeat(notebookCopyLimit + 1)], {
        type: 'application/json',
      }),
      () => {},
      expectedActor
    )
  ).rejects.toThrow('Invalid notebook copy');
  expect(() => notebookExportBlob('a'.repeat(notebookCopyLimit))).toThrow(
    'Export too large'
  );
  expect(fetch).not.toHaveBeenCalled();
});
it('stops after a denied Drive upload URL', async () => {
  const fetch = fixture({ deny: true });
  await expect(
    copyNotebookToDrive(
      'workspace',
      notebookExportBlob(payload),
      () => {},
      expectedActor
    )
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('reports an uploaded but unfinalized object without retry or deletion', async () => {
  const fetch = fixture({ failFinalize: true });
  const result = await copyNotebookToDrive(
    'workspace',
    notebookExportBlob(payload),
    () => {},
    expectedActor
  );
  expect(result.finalize?.success).toBe(false);
  expect(result.path).toMatch(/^Lettin\/lettin-notebook-/);
  expect(fetch).toHaveBeenCalledTimes(3);
});
it('blocks the canonical signed PUT fallback so failed writes are never automatically repeated', async () => {
  const fetch = fixture({ failPut: true });
  await expect(
    copyNotebookToDrive(
      'workspace',
      notebookExportBlob(payload),
      () => {},
      expectedActor
    )
  ).rejects.toThrow('already attempted');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([
  ['initial', 0],
  ['url', 1],
  ['put', 2],
  ['finalize', 3],
] as const)(
  'fences expiration at %s without further writes or cleanup',
  async (stage, calls) => {
    let active = stage !== 'initial';
    const fetch = fixture({
      afterStage: (completed) => {
        if (completed === stage) active = false;
      },
    });
    await expect(
      copyNotebookToDrive(
        'workspace',
        notebookExportBlob(payload),
        () => {
          if (!active) throw new Error('Expired');
        },
        expectedActor
      )
    ).rejects.toThrow('Expired');
    expect(fetch).toHaveBeenCalledTimes(calls);
  }
);

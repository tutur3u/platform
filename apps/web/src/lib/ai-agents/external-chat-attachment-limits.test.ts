import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  uploadWorkspaceStorageFileDirect: vi.fn(),
}));

import { readAttachmentBytes } from './external-chat-attachments';

const maxBytes = 25 * 1024 * 1024;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('external attachment actual-byte limits', () => {
  it('rejects oversized Buffer data despite smaller metadata', async () => {
    const result = await readAttachmentBytes({
      type: 'file',
      size: 1,
      data: Buffer.alloc(maxBytes + 1),
    });
    expect(result).toBeNull();
  });

  it('rejects oversized Blob data before arrayBuffer materialization', async () => {
    const data = new Blob([new Uint8Array(maxBytes + 1)]);
    const arrayBuffer = vi.spyOn(data, 'arrayBuffer');
    expect(
      await readAttachmentBytes({ type: 'file', size: 1, data })
    ).toBeNull();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects oversized callback output before making the Uint8Array copy', async () => {
    const data = Buffer.alloc(maxBytes + 1);
    const fetchData = vi.fn(async () => data);
    expect(
      await readAttachmentBytes({ type: 'file', size: 1, fetchData })
    ).toBeNull();
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '1'])(
    'bounds a generic attachment URL body with header %s',
    async (header) => {
      const cancel = vi.fn();
      let reads = 0;
      const pull = vi.fn(
        (controller: ReadableStreamDefaultController<Uint8Array>) => {
          if (reads++ === 0) controller.enqueue(new Uint8Array(maxBytes + 1));
          else controller.close();
        }
      );
      const body = new ReadableStream<Uint8Array>(
        { pull, cancel },
        { highWaterMark: 0 }
      );
      const headers = new Headers();
      if (header !== undefined) headers.set('content-length', header);
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(body, { headers }));
      vi.stubGlobal('fetch', fetchMock);
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      await expect(
        readAttachmentBytes({
          type: 'file',
          url: 'https://media.example.test/file',
        })
      ).rejects.toThrow();
      expect(timeout).toHaveBeenCalledWith(30_000);
      expect(pull).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(body.locked).toBe(false);
    }
  );

  it('retains generic response-status rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 403 }))
    );
    await expect(
      readAttachmentBytes({
        type: 'file',
        url: 'https://media.example.test/file',
      })
    ).rejects.toThrow('external_attachment_fetch_failed_403');
  });

  it('preserves successful callback bytes and empty body semantics', async () => {
    expect(
      await readAttachmentBytes({
        type: 'file',
        fetchData: async () => Buffer.from([2, 4, 6]),
      })
    ).toEqual(new Uint8Array([2, 4, 6]));
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null))
    );
    expect(
      await readAttachmentBytes({
        type: 'file',
        url: 'https://media.example.test/empty',
      })
    ).toEqual(new Uint8Array(0));
  });
});

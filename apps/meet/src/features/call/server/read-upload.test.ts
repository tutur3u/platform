import { expect, it, vi } from 'vitest';

vi.mock('../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { readBoundedFormData } from './read-upload';

it('enforces the body limit even without Content-Length', async () => {
  const request = new Request('https://meet.test/files', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=test' },
    body: new Uint8Array(100),
  });
  await expect(readBoundedFormData(request, 20)).rejects.toMatchObject({
    status: 413,
  });
});
it('rejects oversized advertised lengths before reading the stream', async () => {
  const request = new Request('https://meet.test/files', {
    method: 'POST',
    headers: { 'content-length': '1000' },
    body: 'small',
  });
  await expect(readBoundedFormData(request, 20)).rejects.toMatchObject({
    status: 413,
  });
});

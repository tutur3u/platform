// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readVoiceForm, VOICE_REQUEST_LIMIT } from './request';

describe('Notes multipart streaming limits', () => {
  it('reads multipart fields after a bounded stream', async () => {
    const form = new FormData();
    form.append('requestId', 'fixture');
    form.append('audio', new Blob(['audio']), 'voice.wav');
    const parsed = await readVoiceForm(
      new Request('https://api.example', { method: 'POST', body: form })
    );
    expect(parsed.get('requestId')).toBe('fixture');
    expect(parsed.get('audio')).toBeInstanceOf(File);
  });
  it('rejects actual oversized chunked data even without Content-Length', async () => {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(VOICE_REQUEST_LIMIT + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('https://api.example', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);
    await expect(readVoiceForm(request)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
  });
  it('returns a typed 400 for malformed multipart', async () => {
    await expect(
      readVoiceForm(
        new Request('https://api.example', {
          method: 'POST',
          body: 'not multipart',
          headers: { 'Content-Type': 'multipart/form-data; boundary=missing' },
        })
      )
    ).rejects.toMatchObject({ status: 400, code: 'invalid_multipart' });
  });
});

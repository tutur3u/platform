import { expect, it, vi } from 'vitest';
import { updateMeetAiSession, uploadMeetAiChunk } from './meet-ai';

it('sends binary multipart with browser-generated boundaries and auth intact', async () => {
  const bytes = new Uint8Array([0, 255, 34, 39, 60, 62, 0, 128]);
  const body = new FormData();
  body.set('audio_0', new Blob([bytes], { type: 'audio/wav' }), 'source-0.wav');
  body.set(
    'sources',
    JSON.stringify([{ sourceKind: 'microphone', startSeconds: 0 }])
  );
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const request = new Request(url, init);
    expect(request.method).toBe('POST');
    expect(request.headers.get('content-type')).toMatch(
      /^multipart\/form-data; boundary=/u
    );
    expect(request.headers.get('authorization')).toBe('Bearer fixture');
    expect(request.headers.get('x-meet-audio-batch')).toBe('1');
    expect(new URL(request.url).searchParams.get('audioBatch')).toBe('1');
    const audio = (await request.formData()).get('audio_0');
    expect(audio).toBeInstanceOf(File);
    if (!(audio instanceof File)) throw new Error('Expected binary part');
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(bytes);
    return Response.json({ status: 'completed' });
  });
  await uploadMeetAiChunk('workspace', 'meeting', body, {
    baseUrl: 'https://meet.example.test',
    defaultHeaders: { Authorization: 'Bearer fixture' },
    fetch,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('preserves the Mira consent code from a refused transcript start', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ code: 'MIRA_ROOM_CONSENT_REQUIRED' }, { status: 409 })
  );
  await expect(
    updateMeetAiSession(
      'workspace',
      'meeting',
      { action: 'start' },
      { baseUrl: 'https://meet.example.test', fetch }
    )
  ).rejects.toMatchObject({ status: 409, code: 'MIRA_ROOM_CONSENT_REQUIRED' });
});

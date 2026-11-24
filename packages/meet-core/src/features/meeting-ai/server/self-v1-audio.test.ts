import { describe, expect, it } from 'vitest';
import { encodeMeetWav } from '../audio';
import { readSelfChunkAudio, readSelfChunkFields } from './self-v1-audio';

const id = '00000000-0000-4000-8000-000000000001';
const request = (headers: Record<string, string> = {}) =>
  new Request('https://meet.tuturuuu.com/api/meet-ai/x/y/chunks', {
    method: 'POST',
    headers,
  });
function form(seconds = 2, extra: Record<string, string | Blob> = {}) {
  const body = new FormData();
  body.set('sessionId', id);
  body.set('streamId', id);
  body.set('id', id);
  body.set('sequence', '0');
  body.set('startSample', '16000');
  body.set('consentRevision', '1');
  body.set('audio', encodeMeetWav(new Float32Array(16000 * seconds)), 'a.wav');
  for (const [key, value] of Object.entries(extra)) body.append(key, value);
  return body;
}
const status = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { status: number }).status;
  }
  return 200;
};

describe('self_v1 chunk fields', () => {
  it('accepts exactly the listed fields', () => {
    expect(readSelfChunkFields(request(), form())).toMatchObject({
      sessionId: id,
      streamId: id,
      sequence: 0,
      startSample: 16000,
      consentRevision: 1,
    });
  });

  it('refuses a batch header', () => {
    expect(
      status(() =>
        readSelfChunkFields(request({ 'x-meet-audio-batch': '1' }), form())
      )
    ).toBe(400);
  });

  it.each([
    ['speakerAccountId', id],
    ['accountId', id],
    ['account_id', id],
    ['speaker', 'Someone'],
    ['sourceKind', 'shared_audio'],
    ['source', 'screen'],
    ['sources', '[]'],
    ['audio_0', new Blob(['x'])],
  ])('refuses a client %s field', (key, value) => {
    expect(
      status(() => readSelfChunkFields(request(), form(2, { [key]: value })))
    ).toBe(400);
  });

  it('refuses a second audio part and a missing one', () => {
    expect(
      status(() =>
        readSelfChunkFields(request(), form(2, { audio: new Blob(['x']) }))
      )
    ).toBe(400);
    const body = form();
    body.delete('audio');
    expect(status(() => readSelfChunkFields(request(), body))).toBe(400);
  });
});

describe('self_v1 canonical audio', () => {
  it('re-wraps the PCM under a server header with a byte-derived duration', async () => {
    const source = encodeMeetWav(new Float32Array(16000 * 2));
    const body = form(2);
    const audio = await readSelfChunkAudio(body);
    expect(audio.durationSeconds).toBe(2);
    expect(audio.digestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(audio.wav.byteLength).toBe(source.size);
  });

  it.each([
    ['under one second', 0.5],
    ['over ten seconds', 11],
  ])('refuses audio %s', async (_label, seconds) => {
    const body = new FormData();
    body.set(
      'audio',
      encodeMeetWav(new Float32Array(Math.round(16000 * seconds))),
      'a.wav'
    );
    await expect(readSelfChunkAudio(body)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('refuses a non-canonical container', async () => {
    const bytes = new Uint8Array(
      await encodeMeetWav(new Float32Array(16000 * 2)).arrayBuffer()
    );
    new DataView(bytes.buffer).setUint32(24, 48000, true);
    const body = new FormData();
    body.set('audio', new Blob([bytes]), 'a.wav');
    await expect(readSelfChunkAudio(body)).rejects.toMatchObject({
      status: 400,
    });
  });
});

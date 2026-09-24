import type { Session } from '@google/genai/web';
import { expect, it, vi } from 'vitest';
import { LiveAudioInput } from '../../../cloudflare/live/audio-input';

it('ends pending input once and permits another turn after unmuting', () => {
  const sendRealtimeInput = vi.fn();
  const provider = { sendRealtimeInput } as unknown as Session;
  const input = new LiveAudioInput();
  input.end(provider);
  expect(sendRealtimeInput).not.toHaveBeenCalled();
  input.send(provider, 'AAAA');
  input.end(provider);
  input.end(provider);
  expect(sendRealtimeInput.mock.calls).toEqual([
    [{ audio: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' } }],
    [{ audioStreamEnd: true }],
  ]);
  input.send(provider, 'AAAA');
  input.end(provider);
  expect(sendRealtimeInput).toHaveBeenCalledTimes(4);
});

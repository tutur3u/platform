import { expect, it, vi } from 'vitest';

const generate = vi.hoisted(() => vi.fn().mockResolvedValue({ text: 'hello' }));
vi.mock('./gemini', () => ({ generateMeetArtifact: generate }));

import { geminiSttProvider } from './stt-provider';

it('forwards clips, hints and provider options and preserves the result', async () => {
  const clips = [new Uint8Array([1, 2])];
  const hints = { language: 'vi' as const, glossary: 'Tuturuuu' };
  const options = { maxOutputTokens: 100 };
  expect(
    await geminiSttProvider.transcribeBatch(clips, hints, options)
  ).toEqual({ text: 'hello' });
  expect(generate).toHaveBeenCalledWith(
    { audioSegments: clips, hints },
    options
  );
});

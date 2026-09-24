import {
  MEET_AUDIO_BATCH_MAX_BYTES,
  MEET_AUDIO_BATCH_MAX_CLIPS,
} from '@tuturuuu/ai/meetings/audio-contract';
import { z } from 'zod';
import { MeetAiError } from './access';

export const sourceSchema = z
  .object({
    speakerAccountId: z.uuid().optional(),
    sourceKind: z.enum(['microphone', 'shared_audio']).optional(),
    startSeconds: z.coerce.number().min(0).max(16_200),
  })
  .refine(
    (value) => !value.speakerAccountId || value.sourceKind !== undefined,
    { message: 'Source kind is required for attribution', path: ['sourceKind'] }
  );

export async function readAudioParts(body: FormData, batched: boolean) {
  let sources: z.infer<typeof sourceSchema>[];
  try {
    sources = batched
      ? z
          .array(
            sourceSchema.refine((source) => source.sourceKind !== undefined)
          )
          .min(1)
          .max(MEET_AUDIO_BATCH_MAX_CLIPS)
          .parse(JSON.parse(String(body.get('sources'))))
      : [sourceSchema.parse(Object.fromEntries(body))];
  } catch {
    throw new MeetAiError(400, 'Invalid audio sources');
  }
  let totalBytes = 0;
  const parts = [];
  for (const [index, source] of sources.entries()) {
    const audio = body.get(batched ? `audio_${index}` : 'audio');
    if (!(audio instanceof File) || audio.size <= 44 || audio.size > 480_044)
      throw new MeetAiError(400, 'Invalid audio');
    totalBytes += audio.size;
    if (totalBytes > MEET_AUDIO_BATCH_MAX_BYTES)
      throw new MeetAiError(413, 'Audio too large');
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const ascii = (offset: number, size: number) =>
      new TextDecoder().decode(bytes.subarray(offset, offset + size));
    if (
      ascii(0, 4) !== 'RIFF' ||
      ascii(8, 8) !== 'WAVEfmt ' ||
      ascii(36, 4) !== 'data' ||
      view.getUint32(16, true) !== 16 ||
      view.getUint16(20, true) !== 1 ||
      view.getUint16(22, true) !== 1 ||
      view.getUint32(24, true) !== 16000 ||
      view.getUint16(34, true) !== 16 ||
      view.getUint32(40, true) !== bytes.length - 44 ||
      (bytes.length - 44) % 2 !== 0
    )
      throw new MeetAiError(400, 'Invalid PCM audio');
    parts.push({
      ...source,
      bytes,
      durationSeconds: (bytes.length - 44) / 32000,
    });
  }
  return parts;
}

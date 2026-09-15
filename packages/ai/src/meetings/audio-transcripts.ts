import { z } from 'zod';
import { MEET_AUDIO_BATCH_MAX_CLIPS } from './audio-contract';

export const audioTranscriptsSchema = z.object({
  transcripts: z.array(
    z.object({
      index: z
        .number()
        .int()
        .min(0)
        .max(MEET_AUDIO_BATCH_MAX_CLIPS - 1),
      text: z.string(),
    })
  ),
});
export function orderedAudioTranscripts(output: unknown, count: number) {
  const { transcripts } = audioTranscriptsSchema.parse(output);
  if (
    transcripts.length !== count ||
    new Set(transcripts.map((part) => part.index)).size !== count ||
    transcripts.some((part) => part.index >= count)
  )
    throw new Error('Incomplete audio source transcription');
  return transcripts.sort((a, b) => a.index - b.index).map((part) => part.text);
}

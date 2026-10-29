import { generateMeetArtifact } from './gemini';
import type { TranscriptionHints } from './transcription-hints';

export interface SttProvider {
  transcribeBatch(
    clips: Uint8Array[],
    hints?: TranscriptionHints,
    options?: Parameters<typeof generateMeetArtifact>[1]
  ): ReturnType<typeof generateMeetArtifact>;
}

export const geminiSttProvider: SttProvider = {
  transcribeBatch: (clips, hints, options) =>
    generateMeetArtifact({ audioSegments: clips, hints }, options),
};

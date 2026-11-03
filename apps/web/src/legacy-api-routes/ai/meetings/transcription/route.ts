import { createPOST } from '@tuturuuu/ai/meetings/transcription/route';

// Legacy stored-recording transcription is permanently refused; the shared
// handler takes no gate, config or flag that could re-enable it.
const POST = createPOST();

export { POST };

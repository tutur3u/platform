import { createPOST } from '@tuturuuu/ai/meetings/transcription/route';
import { meetAiAvailable } from '@tuturuuu/meet-core/features/meeting-ai/server/workspace-gate';

const POST = createPOST({ isMeetAiEnabled: meetAiAvailable });

export { POST };

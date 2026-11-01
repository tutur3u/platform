import { createPOST } from '@tuturuuu/ai/meetings/transcription/route';
import { isMeetAiEnabledOnWeb } from './meet-ai-gate';

const POST = createPOST({ isMeetAiEnabled: isMeetAiEnabledOnWeb });

export { POST };

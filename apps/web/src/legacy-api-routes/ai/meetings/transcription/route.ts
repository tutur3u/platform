import { createPOST } from '@tuturuuu/ai/meetings/transcription/route';
import { isMeetAiEnabledOnWeb } from './meet-ai-gate';
import { limitMeetAiUsageOnWeb } from './meet-ai-usage-limit';

const POST = createPOST({
  isMeetAiEnabled: isMeetAiEnabledOnWeb,
  limitMeetAiUsage: limitMeetAiUsageOnWeb,
});

export { POST };

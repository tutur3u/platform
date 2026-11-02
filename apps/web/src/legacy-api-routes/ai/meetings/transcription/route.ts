import { createPOST } from '@tuturuuu/ai/meetings/transcription/route';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { isMeetAiEnabledOnWeb } from './meet-ai-gate';
import { limitMeetAiUsageOnWeb } from './meet-ai-usage-limit';

const POST = createPOST({
  isLegacyMeetingTranscriptionEnabled: async (wsId) =>
    (await getWorkspaceConfig(wsId, 'legacy_meeting_transcription_enabled')) ===
    'true',
  isMeetAiEnabled: isMeetAiEnabledOnWeb,
  limitMeetAiUsage: limitMeetAiUsageOnWeb,
});

export { POST };

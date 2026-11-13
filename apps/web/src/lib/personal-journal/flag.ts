import { verifySecret } from '@tuturuuu/utils/workspace-helper';

export const JOURNAL_MOOD_TRACKING_FLAG = 'ENABLE_JOURNAL_MOOD_TRACKING';

export async function isJournalMoodTrackingEnabled(
  wsId: string
): Promise<boolean> {
  try {
    return await verifySecret({
      forceAdmin: true,
      name: JOURNAL_MOOD_TRACKING_FLAG,
      value: 'true',
      wsId,
    });
  } catch {
    return false;
  }
}

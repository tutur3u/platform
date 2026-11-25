import { verifySecret } from '@tuturuuu/utils/workspace-helper';

/** Workspace secret that opts a workspace into the instant board sync pilot. */
export const INSTANT_BOARD_SYNC_SECRET = 'ENABLE_INSTANT_BOARD_SYNC';

/**
 * Pilot flag for TanStack DB board sync. Off unless the workspace secret is
 * exactly `true`; any lookup failure keeps the established board path.
 */
export async function isInstantBoardSyncEnabled(workspaceId: string) {
  try {
    return await verifySecret({
      wsId: workspaceId,
      forceAdmin: true,
      name: INSTANT_BOARD_SYNC_SECRET,
      value: 'true',
    });
  } catch (error) {
    console.warn('Instant board sync flag lookup failed:', error);
    return false;
  }
}

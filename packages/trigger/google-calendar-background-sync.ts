import {
  getWorkspacesForSync,
  getWorkspaceTokensByWsId,
  syncWorkspaceExtended,
  syncWorkspaceImmediate,
} from './google-calendar-sync.js';

interface WorkspaceToken {
  ws_id: string;
  access_token: string;
  refresh_token?: string;
}

interface WorkspaceSyncResult {
  ws_id: string;
  success: boolean;
  error?: string;
  eventsSynced?: number;
  eventsDeleted?: number;
}

// Helper function for single workspace sync
const triggerWorkspaceSync = async (
  ws_id: string,
  syncFunction: (workspace: WorkspaceToken) => Promise<WorkspaceSyncResult>,
  syncType: 'immediate' | 'extended'
) => {
  console.log(
    `=== Manually triggering ${syncType} sync for workspace ${ws_id} ===`
  );

  try {
    const workspace = (await getWorkspaceTokensByWsId(
      ws_id
    )) as WorkspaceToken | null;

    if (!workspace) {
      console.error(
        `Workspace ${ws_id} not found or no access token available`
      );
      return {
        ws_id,
        success: false,
        error: 'Workspace not found or no access token',
      };
    }

    const result = await syncFunction(workspace);
    console.log(
      `=== Manual ${syncType} sync for workspace ${ws_id} completed ===`
    );
    return result;
  } catch (error) {
    console.error(
      `Error in manual ${syncType} sync for workspace ${ws_id}:`,
      error
    );
    return {
      ws_id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Manual trigger function for immediate sync of a specific workspace
export const triggerWorkspaceImmediateSync = async (ws_id: string) => {
  return triggerWorkspaceSync(ws_id, syncWorkspaceImmediate, 'immediate');
};

// Manual trigger function for extended sync of a specific workspace
export const triggerWorkspaceExtendedSync = async (ws_id: string) => {
  return triggerWorkspaceSync(ws_id, syncWorkspaceExtended, 'extended');
};

// Manual trigger function for all workspaces immediate sync
export const triggerAllWorkspacesImmediateSync = async () => {
  console.log('=== Manually triggering immediate sync for all workspaces ===');

  try {
    const workspaces = await getWorkspacesForSync();
    console.log(`Found ${workspaces.length} workspaces to sync immediately`);

    const results = [];
    for (const workspace of workspaces) {
      try {
        const result = await syncWorkspaceImmediate(workspace);
        results.push(result);
      } catch (error) {
        console.error(
          `Error in manual immediate sync for workspace ${workspace.ws_id}:`,
          error
        );
        results.push({
          ws_id: workspace.ws_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log('=== Manual immediate sync for all workspaces completed ===');
    return results;
  } catch (error) {
    console.error('Error in manual immediate sync for all workspaces:', error);
    throw error;
  }
};

// Manual trigger function for all workspaces extended sync
export const triggerAllWorkspacesExtendedSync = async () => {
  console.log('=== Manually triggering extended sync for all workspaces ===');

  try {
    const workspaces = await getWorkspacesForSync();
    console.log(`Found ${workspaces.length} workspaces to sync extended`);

    const results = [];
    for (const workspace of workspaces) {
      try {
        const result = await syncWorkspaceExtended(workspace);
        results.push(result);
      } catch (error) {
        console.error(
          `Error in manual extended sync for workspace ${workspace.ws_id}:`,
          error
        );
        results.push({
          ws_id: workspace.ws_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log('=== Manual extended sync for all workspaces completed ===');
    return results;
  } catch (error) {
    console.error('Error in manual extended sync for all workspaces:', error);
    throw error;
  }
};

// Utility function to get workspace sync status
export const getWorkspaceSyncStatus = async () => {
  try {
    const workspaces = await getWorkspacesForSync();
    return workspaces.map((workspace) => ({
      ws_id: workspace.ws_id,
      hasAccessToken: !!workspace.access_token,
      hasRefreshToken: !!workspace.refresh_token,
    }));
  } catch (error) {
    console.error('Error getting workspace sync status:', error);
    return [];
  }
};

// Export individual functions for separate scheduling
export { syncWorkspaceImmediate, syncWorkspaceExtended, getWorkspacesForSync };

import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';

export type WorkspaceReportConfigRow = WorkspaceConfig & {
  id: string;
  name: string;
  ws_id: string;
};

export type WorkspaceReportConfigUpdate = {
  configId: string;
  value: string;
  workspaceId: string;
};

export type WorkspaceReportConfigActionResult =
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
      status?: number;
    };

export type UpdateWorkspaceReportConfig = (
  input: WorkspaceReportConfigUpdate
) => Promise<WorkspaceReportConfigActionResult>;

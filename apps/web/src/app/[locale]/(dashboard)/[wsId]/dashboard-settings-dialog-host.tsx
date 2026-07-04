'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  preloadSettingsDialog,
  SettingsDialogHost,
} from '../../settings-dialog-host';

interface DashboardSettingsDialogHostProps {
  user: WorkspaceUser | null;
  workspace?: Workspace | null;
  wsId?: string;
}

export function DashboardSettingsDialogHost({
  user,
  workspace,
  wsId,
}: DashboardSettingsDialogHostProps) {
  return <SettingsDialogHost user={user} workspace={workspace} wsId={wsId} />;
}

export function preloadDashboardSettingsDialogHostContent() {
  preloadSettingsDialog();
}

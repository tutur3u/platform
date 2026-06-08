'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import dynamic from 'next/dynamic';

const SettingsDialogHost = dynamic(
  () =>
    import('../../settings-dialog-host').then(
      (module) => module.SettingsDialogHost
    ),
  { ssr: false }
);

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

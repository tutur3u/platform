'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { SettingsDialogFullscreenSkeleton } from '@/components/settings/settings-dialog-skeleton';

function DashboardSettingsDialogHostLoading() {
  const searchParams = useSearchParams();

  if (searchParams.get('settingsDialog') !== 'open') return null;

  return (
    <Dialog open>
      <SettingsDialogFullscreenSkeleton />
    </Dialog>
  );
}

const SettingsDialogHost = dynamic(
  () =>
    import('../../settings-dialog-host').then(
      (module) => module.SettingsDialogHost
    ),
  {
    loading: () => <DashboardSettingsDialogHostLoading />,
    ssr: false,
  }
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

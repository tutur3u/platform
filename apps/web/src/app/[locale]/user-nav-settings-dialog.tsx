'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { SettingsDialog } from '@/components/settings/settings-dialog';

interface UserNavSettingsDialogProps {
  defaultTab?: string;
  linkedProvider?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: WorkspaceUser;
  workspace?: Workspace | null;
  wsId?: string;
}

export function UserNavSettingsDialog({
  defaultTab,
  linkedProvider,
  onOpenChange,
  open,
  user,
  workspace,
  wsId,
}: UserNavSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SettingsDialog
        wsId={wsId}
        user={user}
        workspace={workspace}
        defaultTab={defaultTab}
        linkedProvider={linkedProvider}
      />
    </Dialog>
  );
}

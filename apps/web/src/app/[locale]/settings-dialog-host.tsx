'use client';

import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { SettingsDialog } from '@/components/settings/settings-dialog';

interface SettingsDialogHostProps {
  wsId?: string;
  user: WorkspaceUser | null;
  workspace?: Workspace | null;
}

export function SettingsDialogHost({
  wsId,
  user,
  workspace,
}: SettingsDialogHostProps) {
  const [settingsQuery, setSettingsQuery] = useQueryStates(
    {
      settingsDialog: parseAsStringLiteral(['open']),
      settingsTab: parseAsString,
      settingsLinkedProvider: parseAsString,
    },
    {
      history: 'replace',
      shallow: true,
      scroll: false,
    }
  );

  const requestedSettingsOpen = settingsQuery.settingsDialog === 'open';
  const requestedSettingsTab = settingsQuery.settingsTab ?? undefined;
  const linkedProvider = settingsQuery.settingsLinkedProvider ?? undefined;

  const handleSettingsOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      void setSettingsQuery(
        {
          settingsDialog: null,
          settingsTab: null,
          settingsLinkedProvider: null,
        },
        {
          history: 'replace',
          shallow: true,
          scroll: false,
        }
      );
    }
  };

  if (!user) return null;

  return (
    <Dialog
      open={requestedSettingsOpen}
      onOpenChange={handleSettingsOpenChange}
    >
      <SettingsDialog
        wsId={wsId}
        user={user}
        workspace={workspace}
        defaultTab={requestedSettingsTab}
        linkedProvider={linkedProvider}
      />
    </Dialog>
  );
}

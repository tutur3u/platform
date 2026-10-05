'use client';

import { claimSettingsDialogIntent } from '@tuturuuu/satellite/settings-dialog-intent';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { useSettingsDialogShortcut } from '@tuturuuu/ui/hooks/use-settings-dialog-shortcut';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useCallback, useEffect } from 'react';
import { SettingsDialog } from './settings-dialog';

const openIntent = 'tuturuuu:settings-dialog-open-intent';

/** One workspace-owned host independent of responsive account-menu mounts. */
export function SettingsDialogHost({
  user,
  wsId,
}: {
  user: WorkspaceUser | null;
  wsId: string;
}) {
  const [query, setQuery] = useQueryStates(
    {
      settingsDialog: parseAsStringLiteral(['open']),
      settingsTab: parseAsString,
    },
    { history: 'replace', shallow: true, scroll: false }
  );
  const openSettings = useCallback(() => {
    void setQuery({ settingsDialog: 'open', settingsTab: null });
  }, [setQuery]);
  useSettingsDialogShortcut({ enabled: Boolean(user), onOpen: openSettings });
  useEffect(() => {
    if (!user) return;
    const onIntent = (event: Event) => {
      if (!claimSettingsDialogIntent(event)) return;
      const detail = event instanceof CustomEvent ? event.detail : null;
      void setQuery({
        settingsDialog: 'open',
        settingsTab:
          typeof detail?.settingsTab === 'string' ? detail.settingsTab : null,
      });
    };
    window.addEventListener(openIntent, onIntent);
    return () => window.removeEventListener(openIntent, onIntent);
  }, [user, setQuery]);
  if (!user) return null;
  const open = query.settingsDialog === 'open';
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void setQuery({ settingsDialog: null, settingsTab: null });
      }}
    >
      {open && (
        <SettingsDialog
          key={`${user.id}:${wsId}:${query.settingsTab ?? 'default'}`}
          user={user}
          wsId={wsId}
          defaultTab={query.settingsTab ?? undefined}
        />
      )}
    </Dialog>
  );
}

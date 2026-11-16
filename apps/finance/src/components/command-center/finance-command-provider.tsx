'use client';

import {
  buildCommandLauncherLabels,
  GlobalCommandLauncher,
  openGlobalCommandLauncher,
} from '@tuturuuu/satellite/command-launcher';
import type { FinanceCommandActionPermissions } from '@tuturuuu/ui/finance/command/finance-command-actions';
import { FinanceCommandSections } from '@tuturuuu/ui/finance/command/finance-command-sections';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';

interface FinanceCommandProviderProps extends FinanceCommandActionPermissions {
  currency?: string;
  workspaceSlug: string;
  wsId: string;
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]'
    )
  );
}

/**
 * Finance's contribution to the shared command center. It mounts inside the
 * Finance route tree so its sections resolve Finance hrefs, and outranks the
 * shell launcher, so Ctrl/Cmd+K opens one center with Finance actions and
 * record search. Bare C opens the same center in quick-create mode.
 */
export function FinanceCommandProvider({
  currency,
  workspaceSlug,
  wsId,
  ...permissions
}: FinanceCommandProviderProps) {
  const palette = useTranslations('command_palette');
  const launcher = useTranslations('command_launcher');
  const tCommand = useTranslations('finance-command-center');
  const labels = useMemo(
    () => ({
      ...buildCommandLauncherLabels({ launcher, palette }),
      placeholder: tCommand('search_placeholder'),
      title: tCommand('title'),
    }),
    [launcher, palette, tCommand]
  );

  useEffect(() => {
    const handleQuickCreate = (event: KeyboardEvent) => {
      if (event.isComposing || isEditableTarget(event.target)) return;
      if (
        event.key.toLowerCase() !== 'c' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openGlobalCommandLauncher({ mode: 'quick-create', scope: 'actions' });
    };

    window.addEventListener('keydown', handleQuickCreate, { capture: true });
    return () =>
      window.removeEventListener('keydown', handleQuickCreate, {
        capture: true,
      });
  }, []);

  return (
    <GlobalCommandLauncher
      currentApp="finance"
      currentWorkspaceId={wsId}
      extraSections={(context) => (
        <FinanceCommandSections
          {...permissions}
          context={context}
          currency={currency}
          workspaceSlug={workspaceSlug}
          wsId={wsId}
        />
      )}
      instancePriority={10}
      labels={labels}
    />
  );
}

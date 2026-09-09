'use client';

import type { LaunchableWorkspace } from '@tuturuuu/utils/launchable-apps';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppsLauncherCoreDialog } from './apps-launcher-core';

interface AppsLauncherDialogProps {
  currentWorkspace?: LaunchableWorkspace | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AppsLauncherDialog({
  currentWorkspace,
  onOpenChange,
  open,
}: AppsLauncherDialogProps) {
  const t = useTranslations('command_launcher');
  const commonT = useTranslations('common');
  return (
    <AppsLauncherCoreDialog
      closeLabel={commonT('close')}
      currentWorkspace={currentWorkspace}
      linkComponent={Link}
      onOpenChange={onOpenChange}
      open={open}
      t={(key, values) => t(key as never, values as never)}
    />
  );
}

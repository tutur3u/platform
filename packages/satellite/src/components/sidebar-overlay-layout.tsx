'use client';

import { Structure } from '@tuturuuu/ui/custom/structure';
import { useSettingsDialogUrlState } from '@tuturuuu/ui/hooks/use-settings-dialog-url-state';
import type { ComponentProps } from 'react';

export function SidebarOverlayLayout({
  sidebarOverlayOpen,
  ...props
}: ComponentProps<typeof Structure>) {
  const { open: settingsOpen } = useSettingsDialogUrlState();
  return (
    <Structure
      {...props}
      sidebarOverlayOpen={sidebarOverlayOpen || settingsOpen}
    />
  );
}

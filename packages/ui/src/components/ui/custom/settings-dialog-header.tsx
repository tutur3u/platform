'use client';

import { X } from '@tuturuuu/icons';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import { Button } from '@tuturuuu/ui/button';
import { DialogClose } from '@tuturuuu/ui/dialog';
import type { ReactNode } from 'react';
import type {
  SettingsNavGroup,
  SettingsNavItem,
} from './satellite-settings-dialog-shell';

/**
 * Top bar of the settings content pane: the mobile navigation trigger, the
 * Settings / group / tab breadcrumb, and the close button.
 */
export function SettingsDialogHeader({
  activeGroup,
  activeGroupBreadcrumb,
  activeItem,
  closeLabel,
  mobileNav,
  settingsLabel,
}: {
  activeGroup?: SettingsNavGroup;
  activeGroupBreadcrumb?: ReactNode;
  activeItem?: SettingsNavItem;
  closeLabel: string;
  mobileNav?: ReactNode;
  settingsLabel: string;
}) {
  return (
    <header
      data-settings-pane="header"
      className="flex h-14 shrink-0 items-center gap-2 border-b px-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6"
    >
      <div className="flex flex-1 items-center gap-2 md:flex-initial">
        {mobileNav}

        <Breadcrumb className="hidden md:flex">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#" className="pointer-events-none">
                {settingsLabel}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            {activeGroup && (
              <>
                <BreadcrumbItem data-testid="settings-active-group-breadcrumb">
                  {activeGroupBreadcrumb ?? (
                    <BreadcrumbPage className="text-muted-foreground">
                      {activeGroup.label}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}
            <BreadcrumbItem>
              <BreadcrumbPage>{activeItem?.label}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <DialogClose asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-11 shrink-0 text-muted-foreground md:size-9"
        >
          <X className="h-4 w-4" data-testid="settings-mobile-close-icon" />
          <span className="sr-only">{closeLabel}</span>
        </Button>
      </DialogClose>
    </header>
  );
}

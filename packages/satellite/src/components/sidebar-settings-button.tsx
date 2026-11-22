'use client';

import { Settings } from '@tuturuuu/icons';
import {
  SidebarNavigationItemContent,
  satelliteNavigationItemClass,
} from '@tuturuuu/ui/custom/satellite-navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';

const SETTINGS_DIALOG_OPEN_INTENT_EVENT =
  'tuturuuu:settings-dialog-open-intent';

/**
 * Opens the settings dialog from the sidebar footer. It shares the nav item
 * class, so its hover and focus shape matches every sidebar link.
 */
export function SidebarSettingsButton({
  isCollapsed,
  label,
}: {
  isCollapsed: boolean;
  label: string;
}) {
  const button = (
    <button
      aria-label={label}
      className={satelliteNavigationItemClass({ isCollapsed, tightEnd: true })}
      data-slot="sidebar-settings-button"
      onClick={(event) =>
        window.dispatchEvent(
          new CustomEvent(SETTINGS_DIALOG_OPEN_INTENT_EVENT, {
            cancelable: true,
            detail: { returnFocus: event.currentTarget },
          })
        )
      }
      type="button"
    >
      <SidebarNavigationItemContent
        icon={<Settings className="size-4" />}
        isCollapsed={isCollapsed}
        title={label}
      />
    </button>
  );

  if (!isCollapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

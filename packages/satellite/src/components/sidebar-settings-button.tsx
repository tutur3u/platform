'use client';

import { Settings } from '@tuturuuu/icons';
import { satelliteNavigationItemClass } from '@tuturuuu/ui/custom/satellite-navigation';
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
      className={satelliteNavigationItemClass({ isCollapsed })}
      data-slot="sidebar-settings-button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent(SETTINGS_DIALOG_OPEN_INTENT_EVENT, {
            cancelable: true,
          })
        )
      }
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Settings className="size-4 shrink-0" />
        {isCollapsed ? null : <span className="truncate">{label}</span>}
      </span>
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

'use client';

import { Settings } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';

const SETTINGS_DIALOG_OPEN_INTENT_EVENT =
  'tuturuuu:settings-dialog-open-intent';

export function SidebarSettingsButton({
  isCollapsed,
  label,
}: {
  isCollapsed: boolean;
  label: string;
}) {
  const button = (
    <Button
      aria-label={label}
      className={cn(
        'h-9 rounded-lg',
        isCollapsed ? 'w-9 px-0' : 'w-full justify-start px-3'
      )}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent(SETTINGS_DIALOG_OPEN_INTENT_EVENT, {
            cancelable: true,
          })
        )
      }
      variant="ghost"
    >
      <Settings className="size-4 shrink-0" />
      {isCollapsed ? null : <span>{label}</span>}
    </Button>
  );

  if (!isCollapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

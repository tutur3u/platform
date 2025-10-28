import { Settings } from '@tuturuuu/icons';
import type { WorkspaceCalendarGoogleToken } from '@tuturuuu/types';
import { useState } from 'react';
import { Button } from '../../button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';
import { CalendarSettingsDialog } from './calendar-settings-dialog';

export const SettingsButton = ({
  wsId,
  experimentalGoogleToken,
}: {
  wsId: string;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed right-20 bottom-6 z-15 flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            onClick={() => setOpen(true)}
          >
            <Settings className="h-5 w-5" />
            <span className="sr-only">Calendar settings</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Calendar settings</TooltipContent>
      </Tooltip>
      <CalendarSettingsDialog
        wsId={wsId}
        open={open}
        onOpenChange={setOpen}
        experimentalGoogleToken={experimentalGoogleToken}
      />
    </div>
  );
};

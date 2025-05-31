import { Button } from '../../button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';
import { CalendarSettingsDialog } from './calendar-settings-dialog';
import type { CalendarSettings } from './settings/settings-context';
import type { WorkspaceCalendarGoogleToken } from '@tuturuuu/types/db';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { Settings } from 'lucide-react';
import { useState } from 'react';

export const SettingsButton = ({
  wsId,
  experimentalGoogleToken,
  // initialSettings,
  onSaveSettings,
}: {
  wsId: string;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  initialSettings?: Partial<CalendarSettings>;
  onSaveSettings?: (settings: CalendarSettings) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const { updateSettings, settings } = useCalendar();

  const handleSaveSettings = async (newSettings: CalendarSettings) => {
    console.log('Saving settings from dialog:', newSettings);

    // Update the calendar context with the new settings
    updateSettings(newSettings);

    // Call the parent's onSaveSettings if provided
    if (onSaveSettings) {
      await onSaveSettings(newSettings);
    }

    // Force localStorage save
    try {
      localStorage.setItem('calendarSettings', JSON.stringify(newSettings));
      console.log('Manually saved settings to localStorage');
    } catch (error) {
      console.error('Failed to manually save settings to localStorage:', error);
    }
  };

  return (
    <div className="z-15 fixed bottom-6 right-20 flex gap-2">
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
        initialSettings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
};

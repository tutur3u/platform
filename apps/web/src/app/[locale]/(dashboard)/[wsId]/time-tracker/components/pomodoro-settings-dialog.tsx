import { fruit, Icon } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { PomodoroSettings } from '../types';

interface PomodoroSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PomodoroSettings;
  onSettingsChange: (settings: PomodoroSettings) => void;
  defaultSettings: PomodoroSettings;
}

export function PomodoroSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  defaultSettings,
}: PomodoroSettingsDialogProps) {
  const t = useTranslations('time_tracker');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon iconNode={fruit} className="h-5 w-5" />{' '}
            {t('pomodoro_settings_title')}
          </DialogTitle>
          <DialogDescription>{t('pomodoro_settings_desc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>{t('focus_time')}</Label>
              <Input
                type="number"
                min="1"
                max="120"
                value={settings.focusTime}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    focusTime: Number.parseInt(e.target.value, 10) || 25,
                  })
                }
              />
            </div>
            <div>
              <Label>{t('short_break_label')}</Label>
              <Input
                type="number"
                min="1"
                max="30"
                value={settings.shortBreakTime}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    shortBreakTime: Number.parseInt(e.target.value, 10) || 5,
                  })
                }
              />
            </div>
            <div>
              <Label>{t('long_break_label')}</Label>
              <Input
                type="number"
                min="1"
                max="60"
                value={settings.longBreakTime}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    longBreakTime: Number.parseInt(e.target.value, 10) || 15,
                  })
                }
              />
            </div>
          </div>

          <div>
            <Label>{t('sessions_until_long_break')}</Label>
            <Input
              type="number"
              min="2"
              max="8"
              value={settings.sessionsUntilLongBreak}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  sessionsUntilLongBreak:
                    Number.parseInt(e.target.value, 10) || 4,
                })
              }
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-start-breaks">{t('auto_start_breaks')}</Label>
              <Switch
                id="auto-start-breaks"
                checked={settings.autoStartBreaks}
                onCheckedChange={(checked) =>
                  onSettingsChange({
                    ...settings,
                    autoStartBreaks: checked,
                  })
                }
                role="switch"
                aria-checked={settings.autoStartBreaks}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="auto-start-focus">{t('auto_start_focus')}</Label>
              <Switch
                id="auto-start-focus"
                checked={settings.autoStartFocus}
                onCheckedChange={(checked) =>
                  onSettingsChange({
                    ...settings,
                    autoStartFocus: checked,
                  })
                }
                role="switch"
                aria-checked={settings.autoStartFocus}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="enable-notifications">
                {t('enable_notifications')}
              </Label>
              <Switch
                id="enable-notifications"
                checked={settings.enableNotifications}
                onCheckedChange={(checked) =>
                  onSettingsChange({
                    ...settings,
                    enableNotifications: checked,
                  })
                }
                role="switch"
                aria-checked={settings.enableNotifications}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="enable-2020-rule">{t('eye_breaks_2020')}</Label>
              <Switch
                id="enable-2020-rule"
                checked={settings.enable2020Rule}
                onCheckedChange={(checked) =>
                  onSettingsChange({
                    ...settings,
                    enable2020Rule: checked,
                  })
                }
                role="switch"
                aria-checked={settings.enable2020Rule}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="enable-movement-reminder">
                {t('movement_reminders')}
              </Label>
              <Switch
                id="enable-movement-reminder"
                checked={settings.enableMovementReminder}
                onCheckedChange={(checked) =>
                  onSettingsChange({
                    ...settings,
                    enableMovementReminder: checked,
                  })
                }
                role="switch"
                aria-checked={settings.enableMovementReminder}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onSettingsChange(defaultSettings)}
              className="flex-1"
            >
              {t('reset_defaults')}
            </Button>
            <Button onClick={() => onOpenChange(false)} className="flex-1">
              {t('save_settings')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

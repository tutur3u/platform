'use client';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

interface TimePresetsProps {
  onSelectPreset: (startTime: string, endTime: string) => void;
  disabled?: boolean;
}

export function TimePresets({ onSelectPreset, disabled }: TimePresetsProps) {
  const t = useTranslations('time-tracker.missed_entry_dialog');

  const presets = [
    { label: t('presets.lastHour'), minutes: 60 },
    { label: t('presets.last2Hours'), minutes: 120 },
    {
      label: t('presets.morning'),
      isCustom: true,
      start: '09:00',
      end: '12:00',
    },
    {
      label: t('presets.afternoon'),
      isCustom: true,
      start: '13:00',
      end: '17:00',
    },
    {
      label: t('presets.yesterday'),
      isCustom: true,
      start: 'yesterday-9',
      end: 'yesterday-17',
    },
  ];

  const handlePresetClick = (preset: (typeof presets)[number]) => {
    const now = dayjs();
    let startTime = '';
    let endTime = '';

    if (preset.isCustom) {
      if (preset.start === 'yesterday-9') {
        const yesterday = now.subtract(1, 'day');
        startTime = yesterday.hour(9).minute(0).format('YYYY-MM-DDTHH:mm');
        endTime = yesterday.hour(17).minute(0).format('YYYY-MM-DDTHH:mm');
      } else if (preset.start && preset.end) {
        const today = now.startOf('day');
        const startParts = preset.start.split(':');
        const endParts = preset.end.split(':');
        const startHour = parseInt(startParts[0] || '9', 10);
        const startMin = parseInt(startParts[1] || '0', 10);
        const endHour = parseInt(endParts[0] || '17', 10);
        const endMin = parseInt(endParts[1] || '0', 10);
        startTime = today
          .hour(startHour)
          .minute(startMin)
          .format('YYYY-MM-DDTHH:mm');
        endTime = today.hour(endHour).minute(endMin).format('YYYY-MM-DDTHH:mm');
      }
    } else if (preset.minutes) {
      const end = now;
      const start = end.subtract(preset.minutes, 'minutes');
      startTime = start.format('YYYY-MM-DDTHH:mm');
      endTime = end.format('YYYY-MM-DDTHH:mm');
    }

    onSelectPreset(startTime, endTime);
  };

  return (
    <div className="rounded-lg border p-3">
      <Label className="text-muted-foreground text-xs">
        {t('presets.title')}
      </Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            type="button"
            onClick={() => handlePresetClick(preset)}
            disabled={disabled}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

'use client';

import { CalendarClock, Save, Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { AnnouncementDeliveryMode } from './announcement-form-state';

const DELIVERY_OPTIONS = [
  {
    icon: Save,
    labelKey: 'announcement_delivery_draft',
    value: 'draft',
  },
  {
    icon: Send,
    labelKey: 'announcement_delivery_send',
    value: 'send',
  },
  {
    icon: CalendarClock,
    labelKey: 'announcement_delivery_schedule',
    value: 'schedule',
  },
] as const;

interface Props {
  canSend: boolean;
  deliveryMode: AnnouncementDeliveryMode;
  onTimezoneRequired: () => void;
  scheduledAt: Date | undefined;
  schedulingTimezone: string | null;
  setDeliveryMode: (mode: AnnouncementDeliveryMode) => void;
  setScheduledAt: (date: Date | undefined) => void;
}

export function AnnouncementDeliveryOptions({
  canSend,
  deliveryMode,
  onTimezoneRequired,
  scheduledAt,
  schedulingTimezone,
  setDeliveryMode,
  setScheduledAt,
}: Props) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="space-y-4 rounded-md border bg-background p-4">
      <div>
        <h3 className="font-medium text-base">
          {t('announcement_delivery_title')}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t('announcement_delivery_helper')}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {DELIVERY_OPTIONS.map((option) => {
          const Icon = option.icon;
          const value = option.value;
          const selected = deliveryMode === value;
          const disabled = value !== 'draft' && !canSend;

          return (
            <button
              aria-pressed={selected}
              className={cn(
                'flex items-center gap-3 rounded-md border bg-background p-3 text-left transition-colors',
                selected
                  ? 'border-dynamic-blue/35 bg-dynamic-blue/10'
                  : 'border-border hover:border-dynamic-blue/25',
                disabled && 'cursor-not-allowed opacity-60'
              )}
              disabled={disabled}
              key={value}
              onClick={() => setDeliveryMode(value)}
              type="button"
            >
              <Icon className="h-4 w-4 text-dynamic-blue" />
              <span className="font-medium text-sm">{t(option.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {deliveryMode === 'schedule' ? (
        schedulingTimezone ? (
          <div className="space-y-2">
            <DateTimePicker
              date={scheduledAt}
              inline
              preferences={{ timezone: schedulingTimezone }}
              setDate={setScheduledAt}
            />
            <p className="text-muted-foreground text-xs">
              {t('schedule_send_timezone_helper', {
                timezone: schedulingTimezone,
              })}
            </p>
          </div>
        ) : (
          <Button onClick={onTimezoneRequired} type="button" variant="outline">
            {t('announcement_set_timezone')}
          </Button>
        )
      ) : null}
    </div>
  );
}

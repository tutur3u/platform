'use client';

import { CalendarClock, Save, Send } from '@tuturuuu/icons';
import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type {
  AnnouncementDeliveryMode,
  AnnouncementFormValues,
} from './announcement-form-state';

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
  contacts: TopicAnnouncementContact[];
  deliveryMode: AnnouncementDeliveryMode;
  form: AnnouncementFormValues;
  groups: UserGroup[];
  onTimezoneRequired: () => void;
  scheduledAt: Date | undefined;
  schedulingTimezone: string | null;
  setDeliveryMode: (mode: AnnouncementDeliveryMode) => void;
  setScheduledAt: (date: Date | undefined) => void;
}

export function AnnouncementFormReviewStep({
  canSend,
  contacts,
  deliveryMode,
  form,
  groups,
  onTimezoneRequired,
  scheduledAt,
  schedulingTimezone,
  setDeliveryMode,
  setScheduledAt,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const selectedContacts = contacts.filter((contact) =>
    form.contactIds.includes(contact.id)
  );
  const groupName =
    groups.find((group) => group.id === form.groupId)?.name ?? t('none');
  const timeRange = [form.startTime, form.endTime].filter(Boolean).join(' - ');

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="space-y-4 rounded-md border bg-background p-4">
        <div>
          <h3 className="font-medium text-base">
            {t('announcement_review_title')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('announcement_review_helper')}
          </p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <ReviewItem label={t('announcement_title')} value={form.title} />
          <ReviewItem label={t('classLabel')} value={groupName} />
          <ReviewItem label={t('startTime')} value={timeRange || t('none')} />
          <ReviewItem
            label={t('place')}
            value={
              [form.room, form.place].filter(Boolean).join(' / ') || t('none')
            }
          />
          <ReviewItem
            label={t('recipients')}
            value={selectedContacts.length.toString()}
          />
        </dl>
        <div className="rounded-md border bg-foreground/5 p-3">
          <p className="font-medium text-sm">{t('announcement_message')}</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
            {form.topic}
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-md border bg-background p-4">
        <div>
          <h3 className="font-medium text-base">
            {t('announcement_delivery_title')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('announcement_delivery_helper')}
          </p>
        </div>
        <div className="grid gap-2">
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
                <span className="font-medium text-sm">
                  {t(option.labelKey)}
                </span>
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
            <Button
              onClick={onTimezoneRequired}
              type="button"
              variant="outline"
            >
              {t('announcement_set_timezone')}
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

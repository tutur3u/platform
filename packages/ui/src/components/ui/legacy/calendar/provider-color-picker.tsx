'use client';
import { useQuery } from '@tanstack/react-query';
import {
  type CalendarSourceOption,
  type GoogleProviderColorChoice,
  getGoogleCalendarColorOptions,
} from '@tuturuuu/internal-api';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { readGoogleEventColor } from '@tuturuuu/utils/google-calendar-colors';
import { useTranslations } from 'next-intl';
import { EventColorPicker } from './event-form-components';

export function ProviderColorPicker({
  wsId,
  source,
  value,
  metadata,
  choice,
  onNativeChange,
  onProviderChange,
}: {
  wsId?: string;
  source?: CalendarSourceOption;
  value: SupportedColor;
  metadata?: unknown;
  choice?: GoogleProviderColorChoice;
  onNativeChange: (value: SupportedColor) => void;
  onProviderChange: (choice: GoogleProviderColorChoice) => void;
}) {
  const t = useTranslations('calendar');
  const connectionId =
    source?.provider === 'google' ? source.connectionId : null;
  const { data } = useQuery({
    queryKey: ['google-calendar-color-options', wsId, connectionId],
    enabled: !!wsId && !!connectionId,
    queryFn: () => getGoogleCalendarColorOptions(wsId!, connectionId!),
  });
  if (
    !connectionId ||
    !data?.providerColorWrites ||
    data.connectionId !== connectionId ||
    !data.options.length
  )
    return <EventColorPicker value={value} onChange={onNativeChange} />;
  const current = readGoogleEventColor(metadata);
  const selected =
    choice?.connectionId === connectionId
      ? choice.kind === 'inherit'
        ? 'inherit'
        : `${choice.kind}:${choice.id}`
      : current?.inherited
        ? 'inherit'
        : current?.event_label_id
          ? `label:${current.event_label_id}`
          : current?.color_id
            ? `event:${current.color_id}`
            : undefined;
  return (
    <div className="space-y-1">
      <Label>{t('provider_color_label')}</Label>
      <Select
        value={selected}
        onValueChange={(key) => {
          const option = data.options.find(
            (item) =>
              (item.kind === 'inherit'
                ? 'inherit'
                : `${item.kind}:${item.id}`) === key
          );
          if (option)
            onProviderChange(
              option.kind === 'inherit'
                ? { connectionId, kind: 'inherit' }
                : { connectionId, kind: option.kind, id: option.id! }
            );
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('provider_color_label')} />
        </SelectTrigger>
        <SelectContent>
          {data.options.map((option) => (
            <SelectItem
              key={`${option.kind}:${option.id}`}
              value={
                option.kind === 'inherit'
                  ? 'inherit'
                  : `${option.kind}:${option.id}`
              }
            >
              <span className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: option.background }}
                />
                {option.kind === 'inherit'
                  ? t('inherit_calendar_color')
                  : (option.name ??
                    t('google_event_color', { id: option.id ?? '' }))}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

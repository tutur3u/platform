'use client';

import { CalendarPlus, CopyPlus, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { formatSessionTimeRange } from './tutoring-filters';
import {
  DURATION_PRESETS,
  nextWeeklySlot,
  type TutoringFormValues,
} from './tutoring-types';

const MAX_SLOTS = 50;

type SessionSlot = TutoringFormValues['sessionSlots'][number];

function SlotRow({
  conflicting,
  index,
  onChange,
  onRemove,
  removable,
  slot,
  teacherDisabled,
  teacherOptions,
}: {
  conflicting: boolean;
  index: number;
  onChange: (next: Partial<SessionSlot>) => void;
  onRemove: () => void;
  removable: boolean;
  slot: SessionSlot;
  teacherDisabled: boolean;
  teacherOptions: ComboboxOption[];
}) {
  const t = useTranslations('ws-tutoring');

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-muted/30 p-3 transition-colors',
        conflicting && 'border-dynamic-red/50 bg-dynamic-red/5'
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-muted-foreground text-xs">
          {t('session_number', { index: index + 1 })}
          {slot.sessionDate ? (
            <span className="ml-2 text-foreground tabular-nums">
              {formatSessionTimeRange(slot.startTime, slot.durationMinutes)}
            </span>
          ) : null}
        </span>
        <Button
          aria-label={t('remove_session_slot')}
          className="h-7 w-7 text-muted-foreground hover:text-dynamic-red"
          disabled={!removable}
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`sessionDate-${index}`}>
            {t('date')}
          </Label>
          <Input
            id={`sessionDate-${index}`}
            onChange={(event) => onChange({ sessionDate: event.target.value })}
            type="date"
            value={slot.sessionDate}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`startTime-${index}`}>
            {t('time')}
          </Label>
          <Input
            id={`startTime-${index}`}
            onChange={(event) => onChange({ startTime: event.target.value })}
            type="time"
            value={slot.startTime}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`durationMinutes-${index}`}>
            {t('duration_minutes')}
          </Label>
          <Input
            id={`durationMinutes-${index}`}
            max={480}
            min={1}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              onChange({ durationMinutes: Number.isNaN(parsed) ? 0 : parsed });
            }}
            step={1}
            type="number"
            value={slot.durationMinutes}
          />
          <div className="flex flex-wrap gap-1 pt-1">
            {DURATION_PRESETS.map((preset) => (
              <button
                className={cn(
                  'rounded-md border px-1.5 py-0.5 text-[11px] transition-colors',
                  slot.durationMinutes === preset
                    ? 'border-dynamic-purple/40 bg-dynamic-purple/10 text-dynamic-purple'
                    : 'text-muted-foreground hover:bg-muted'
                )}
                key={preset}
                onClick={() => onChange({ durationMinutes: preset })}
                type="button"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('teacher')}</Label>
          <Combobox
            disabled={teacherDisabled}
            emptyText={t('no_teachers')}
            onChange={(value) =>
              onChange({ teacherUserId: (value as string) || '' })
            }
            options={teacherOptions}
            placeholder={t('select_teacher')}
            searchPlaceholder={t('search_teachers')}
            selected={slot.teacherUserId}
          />
        </div>
      </div>
    </div>
  );
}

export function TutoringCreateSlots({
  conflictingIndexes,
  form,
  onChange,
  singleTeacherId,
  teacherOptions,
}: {
  conflictingIndexes: Set<number>;
  form: TutoringFormValues;
  onChange: (next: TutoringFormValues) => void;
  singleTeacherId?: string;
  teacherOptions: ComboboxOption[];
}) {
  const t = useTranslations('ws-tutoring');
  const atLimit = form.sessionSlots.length >= MAX_SLOTS;

  const updateSlot = (index: number, next: Partial<SessionSlot>) =>
    onChange({
      ...form,
      sessionSlots: form.sessionSlots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...next } : slot
      ),
    });

  const appendSlot = (slot: SessionSlot) =>
    onChange({ ...form, sessionSlots: [...form.sessionSlots, slot] });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>
          {t('session_slots')}
          <span className="ml-2 font-normal text-muted-foreground text-xs">
            {t('session_slot_count', { count: form.sessionSlots.length })}
          </span>
        </Label>
        <div className="flex items-center gap-2">
          <Button
            disabled={atLimit}
            onClick={() =>
              appendSlot(
                nextWeeklySlot(form.sessionSlots, singleTeacherId ?? '')
              )
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <CopyPlus className="h-4 w-4" />
            {t('add_weekly_slot')}
          </Button>
          <Button
            disabled={atLimit}
            onClick={() =>
              appendSlot({
                durationMinutes: 45,
                sessionDate: '',
                startTime: '18:00',
                teacherUserId: singleTeacherId ?? '',
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <CalendarPlus className="h-4 w-4" />
            {t('add_session_slot')}
          </Button>
        </div>
      </div>

      <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
        {form.sessionSlots.map((slot, index) => (
          <SlotRow
            conflicting={conflictingIndexes.has(index)}
            index={index}
            key={`session-slot-${index + 1}`}
            onChange={(next) => updateSlot(index, next)}
            onRemove={() =>
              onChange({
                ...form,
                sessionSlots: form.sessionSlots.filter(
                  (_, slotIndex) => slotIndex !== index
                ),
              })
            }
            removable={form.sessionSlots.length > 1}
            slot={slot}
            teacherDisabled={!form.groupId}
            teacherOptions={teacherOptions}
          />
        ))}
      </div>
    </div>
  );
}

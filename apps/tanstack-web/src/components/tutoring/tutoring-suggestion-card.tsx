'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { listWorkspaceUserGroupSessions } from '@tuturuuu/internal-api';
import { suggestTutoringBeforeNextClass } from '@tuturuuu/internal-api/tutoring-suggestion';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { TutoringFormValues } from './tutoring-types';

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function TutoringSuggestionCard({
  form,
  onChange,
  wsId,
}: {
  form: TutoringFormValues;
  onChange: (next: TutoringFormValues) => void;
  wsId: string;
}) {
  const t = useTranslations('ws-tutoring');
  const [missedDate, setMissedDate] = useState('');
  const [message, setMessage] = useState('');
  const today = localDate(new Date());
  const end = new Date();
  end.setDate(end.getDate() + 28);

  const classSchedule = useQuery({
    enabled: Boolean(form.groupId && missedDate),
    queryKey: ['tutoring-class-schedule', wsId, form.groupId, today],
    queryFn: () =>
      listWorkspaceUserGroupSessions(wsId, {
        from: today,
        groupId: form.groupId,
        to: localDate(end),
      }),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4 md:col-span-2">
      <div>
        <h3 className="font-semibold text-sm">{t('suggestion_title')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('suggestion_description')}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor="missed-class-date">{t('missed_class_date')}</Label>
          <Input
            id="missed-class-date"
            max={today}
            onChange={(event) => {
              setMissedDate(event.target.value);
              setMessage('');
            }}
            type="date"
            value={missedDate}
          />
        </div>
        <Button
          disabled={
            !form.groupId ||
            !missedDate ||
            classSchedule.isFetching ||
            (!classSchedule.isSuccess && !classSchedule.isError)
          }
          onClick={() => {
            if (classSchedule.isError) {
              void classSchedule.refetch();
              return;
            }
            const suggestion = suggestTutoringBeforeNextClass(
              classSchedule.data?.data ?? [],
              missedDate
            );
            if (!suggestion) {
              setMessage(t('suggestion_unavailable'));
              return;
            }
            onChange({
              ...form,
              sessionSlots: form.sessionSlots.map((slot, index) =>
                index === 0
                  ? {
                      ...slot,
                      durationMinutes: 45,
                      sessionDate: suggestion.sessionDate,
                      startTime: suggestion.startTime,
                    }
                  : slot
              ),
            });
            setMessage(
              t('suggestion_applied', { time: suggestion.classStartsAt })
            );
          }}
          type="button"
          variant="outline"
        >
          {classSchedule.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {t('suggest_next_class')}
        </Button>
      </div>
      {classSchedule.isError ? (
        <p className="text-destructive text-sm">{t('schedule_load_failed')}</p>
      ) : message ? (
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}

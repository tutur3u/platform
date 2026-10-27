'use client';

import type { TopicScheduleClass } from '@tuturuuu/internal-api/topic-announcements';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { shiftScheduleMonth } from '@tuturuuu/utils/topic-schedule';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { buildMissingGvnnReminder } from './missing-gvnn';
import { ScheduleCloneDialog } from './schedule-clone-dialog';
import { ScheduleDiscardDialog } from './schedule-discard-dialog';
import { scheduleRowDomId } from './schedule-layout';
import { ScheduleMissingGvnnPanel } from './schedule-missing-gvnn-panel';
import { ScheduleMonthCalendar } from './schedule-month-calendar';
import { ScheduleSessionTable } from './schedule-session-table';
import { type ScheduleFilter, ScheduleToolbar } from './schedule-toolbar';
import { useScheduleEditor } from './use-schedule-editor';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

/** Classes marked "no GVNN needed" plug in here once that marking exists. */
const NO_EXEMPT_CLASSES: ReadonlySet<string> = new Set();
const NO_CLASSES: TopicScheduleClass[] = [];

export function ScheduleMonthEditor({
  month,
  onMonthChange,
  wsId,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements');
  const editor = useScheduleEditor(wsId, month);
  const guard = useUnsavedChangesGuard(editor.isDirty);
  const [filter, setFilter] = useState<ScheduleFilter>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);

  const classes = editor.data?.classes ?? NO_CLASSES;
  const classById = useMemo(
    () => new Map(classes.map((item) => [item.id, item])),
    [classes]
  );
  const reminder = useMemo(
    () =>
      buildMissingGvnnReminder(editor.rows, {
        classLabel: (groupId) =>
          (groupId ? classById.get(groupId)?.name : null) ??
          t('schedule_no_class'),
        exemptGroupIds: NO_EXEMPT_CLASSES,
      }),
    [classById, editor.rows, t]
  );
  const visibleRows =
    filter === 'needs_gvnn'
      ? editor.rows.filter((row) => !row.gvnnContactId && !row.locked)
      : editor.rows;

  const focusRow = (key: string) => {
    setHighlightKey(key);
    requestAnimationFrame(() =>
      document
        .getElementById(scheduleRowDomId(key))
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    );
  };

  // Default day: the one picked in the calendar, else the latest session's.
  const addSession = (
    date = selectedDate ?? editor.rows.at(-1)?.sessionDate ?? `${month}-01`
  ) => {
    setFilter('all');
    focusRow(editor.addSession(date));
  };

  const save = () =>
    editor.save.mutate(undefined, {
      onError: () => toast.error(t('schedule_save_failed')),
      onSuccess: ({ data }) =>
        toast.success(
          t('schedule_saved', {
            count:
              data.createdIds.length +
              data.updatedIds.length +
              data.deletedIds.length,
          })
        ),
    });

  if (editor.query.isError) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-4 text-sm">
        <span>{t('schedule_load_failed')}</span>
        <Button
          onClick={() => editor.query.refetch()}
          size="sm"
          variant="outline"
        >
          {t('schedule_retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScheduleToolbar
        changeCount={editor.changeCount}
        filter={filter}
        hasIssues={editor.issues.size > 0}
        isLoading={editor.query.isLoading}
        isSaving={editor.save.isPending}
        missingCount={reminder.total}
        month={month}
        onAdd={() => addSession()}
        onClone={() => setCloneOpen(true)}
        onDiscard={() => guard.guard(editor.discard)}
        onFilterChange={setFilter}
        onMonthChange={(delta) =>
          guard.guard(() => onMonthChange(shiftScheduleMonth(month, delta)))
        }
        onSave={save}
        sessionCount={editor.rows.length}
      />

      {editor.query.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <ScheduleMonthCalendar
              month={month}
              onSelectDate={(date) => {
                setSelectedDate(date);
                document
                  .getElementById(`schedule-day-${date}`)
                  ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
              }}
              rows={editor.rows}
              selectedDate={selectedDate ?? ''}
            />
            <ScheduleMissingGvnnPanel
              onJump={(key) => {
                setFilter('needs_gvnn');
                focusRow(key);
              }}
              reminder={reminder}
            />
          </aside>
          <ScheduleSessionTable
            classById={classById}
            classes={classes}
            contacts={editor.data?.gvnnContacts ?? []}
            highlightKey={highlightKey}
            issues={editor.issues}
            month={month}
            onAdd={addSession}
            onDuplicate={(row, days) =>
              focusRow(duplicate(editor, row, days, month))
            }
            onRemove={editor.removeRow}
            onUpdate={editor.updateRow}
            originalByKey={editor.originalByKey}
            rows={visibleRows}
            serverErrors={editor.serverErrors}
          />
        </div>
      )}

      <ScheduleCloneDialog
        disabled={editor.isDirty}
        month={month}
        onOpenChange={setCloneOpen}
        open={cloneOpen}
        wsId={wsId}
      />
      <ScheduleDiscardDialog
        onCancel={guard.cancel}
        onConfirm={() => {
          editor.discard();
          guard.confirm();
        }}
        open={guard.isPending}
      />
    </div>
  );
}

/** Copies a row `days` later (same weekday next week); stays in the month. */
function duplicate(
  editor: ReturnType<typeof useScheduleEditor>,
  row: ReturnType<typeof useScheduleEditor>['rows'][number],
  days: number,
  month: string
) {
  const date = new Date(`${row.sessionDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const target = date.toISOString().slice(0, 10);
  return editor.addSession(
    target.startsWith(month) ? target : row.sessionDate,
    {
      durationMinutes: row.durationMinutes,
      groupId: row.groupId,
      gvnnContactId: row.gvnnContactId,
      place: row.place,
      room: row.room,
      startTime: row.startTime,
    }
  );
}

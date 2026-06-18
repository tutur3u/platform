'use client';

import { CalendarPlus } from '@tuturuuu/icons';
import type {
  CreateWorkspaceUserGroupSessionPayload,
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupScheduleGroup,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import '@/lib/dayjs-setup';
import { parseCsv, SESSION_EDITOR_DAYS } from './session-editor-utils';
import {
  buildZonedIso,
  DEFAULT_SCHEDULE_TIMEZONE,
  localDateTimeParts,
} from './session-time-utils';

type SubmitPayload =
  | CreateWorkspaceUserGroupSessionPayload
  | UpdateWorkspaceUserGroupSessionPayload;

interface SessionEditorDialogProps {
  canChooseGroup: boolean;
  defaultGroupId?: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  isPending?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (payload: SubmitPayload) => Promise<void> | void;
  open?: boolean;
  session?: WorkspaceUserGroupSession | null;
  trigger?: React.ReactNode;
}

export function SessionEditorDialog({
  canChooseGroup,
  defaultGroupId,
  groups,
  isPending,
  onOpenChange,
  onSubmit,
  open: controlledOpen,
  session,
  trigger,
}: SessionEditorDialogProps) {
  const t = useTranslations('ws-user-group-schedule');
  const commonT = useTranslations('common');
  const isEditing = !!session;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (value: boolean) => {
    setUncontrolledOpen(value);
    onOpenChange?.(value);
  };
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('20:30');
  const [timezone, setTimezone] = useState(DEFAULT_SCHEDULE_TIMEZONE);
  const [description, setDescription] = useState('');
  const [tagNames, setTagNames] = useState('');
  const [filePaths, setFilePaths] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [untilDate, setUntilDate] = useState('');
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [scope, setScope] = useState<'future' | 'once'>('once');
  useEffect(() => {
    if (!open) return;

    if (session) {
      const parts = localDateTimeParts(session.startsAt, session.startTimezone);
      const endParts = localDateTimeParts(session.endsAt, session.endTimezone);
      setGroupId(session.groupId);
      setTitle(session.title ?? '');
      setDate(parts.date);
      setStartTime(parts.time);
      setEndTime(endParts.time);
      setTimezone(session.startTimezone || DEFAULT_SCHEDULE_TIMEZONE);
      setDescription(session.description ?? '');
      setTagNames(session.tags.map((tag) => tag.name).join(', '));
      setFilePaths(session.files.map((file) => file.storagePath).join(', '));
      setRepeat(false);
      setDaysOfWeek([dayjs(session.startsAt).tz(session.startTimezone).day()]);
      setScope(session.seriesId ? 'future' : 'once');
      return;
    }

    const today = dayjs();
    setGroupId(defaultGroupId ?? groups[0]?.id ?? '');
    setTitle('');
    setDate(today.format('YYYY-MM-DD'));
    setStartTime('19:00');
    setEndTime('20:30');
    setTimezone(DEFAULT_SCHEDULE_TIMEZONE);
    setDescription('');
    setTagNames('');
    setFilePaths('');
    setRepeat(false);
    setDaysOfWeek([today.day()]);
    setUntilDate(today.add(12, 'month').format('YYYY-MM-DD'));
    setIntervalWeeks(1);
    setScope('once');
  }, [defaultGroupId, groups, open, session]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === groupId),
    [groupId, groups]
  );

  const handleSubmit = async () => {
    const startsAt = buildZonedIso(date, startTime, timezone);
    let endsAt = buildZonedIso(date, endTime, timezone);
    if (!dayjs(endsAt).isAfter(dayjs(startsAt))) {
      endsAt = dayjs(endsAt).add(1, 'day').toISOString();
    }

    const shared = {
      description: description.trim() || null,
      endTimezone: timezone,
      endsAt,
      files: parseCsv(filePaths).map((storagePath) => ({ storagePath })),
      startTimezone: timezone,
      startsAt,
      tagNames: parseCsv(tagNames),
      title: title.trim() || selectedGroup?.name || null,
    };

    if (isEditing) {
      await onSubmit({ ...shared, scope });
      setOpen(false);
    } else {
      await onSubmit({
        ...shared,
        groupId,
        recurrence: repeat
          ? {
              daysOfWeek,
              intervalWeeks,
              untilDate: untilDate || null,
            }
          : null,
      });
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">
              <CalendarPlus className="h-4 w-4" />
              {t('new_session')}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('edit_session') : t('new_session')}
          </DialogTitle>
          <DialogDescription>
            {t('session_editor_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          {canChooseGroup && !isEditing && (
            <div className="space-y-2 md:col-span-2">
              <Label>{t('group')}</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('group')} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="session-title">{t('session_title')}</Label>
            <Input
              id="session-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={selectedGroup?.name ?? t('session_title')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-timezone">{t('timezone')}</Label>
            <Input
              id="session-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder={DEFAULT_SCHEDULE_TIMEZONE}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-date">{t('session_date')}</Label>
            <Input
              id="session-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="session-start">{t('start_time')}</Label>
              <Input
                id="session-start"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-end">{t('end_time')}</Label>
              <Input
                id="session-end"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>
          </div>

          {!isEditing && (
            <div className="space-y-3 rounded-md border p-3 md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={repeat}
                  onCheckedChange={(v) => setRepeat(v === true)}
                />
                {t('repeat_weekly')}
              </label>
              {repeat && (
                <div className="grid gap-3 md:grid-cols-[1fr_140px_160px]">
                  <div className="flex flex-wrap gap-2">
                    {SESSION_EDITOR_DAYS.map((day) => (
                      <label
                        key={day.value}
                        className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                      >
                        <Checkbox
                          checked={daysOfWeek.includes(day.value)}
                          onCheckedChange={(checked) =>
                            setDaysOfWeek((current) =>
                              checked
                                ? Array.from(
                                    new Set([...current, day.value])
                                  ).sort()
                                : current.filter((value) => value !== day.value)
                            )
                          }
                        />
                        {commonT(day.labelKey)}
                      </label>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label>{t('interval_weeks')}</Label>
                    <Input
                      min={1}
                      max={52}
                      type="number"
                      value={intervalWeeks}
                      onChange={(event) =>
                        setIntervalWeeks(Number(event.target.value) || 1)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('until_date')}</Label>
                    <Input
                      type="date"
                      value={untilDate}
                      onChange={(event) => setUntilDate(event.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {isEditing && session?.seriesId && (
            <div className="space-y-2 md:col-span-2">
              <Label>{t('edit_scope')}</Label>
              <Select
                value={scope}
                onValueChange={(value) => setScope(value as 'future' | 'once')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">{t('edit_scope_once')}</SelectItem>
                  <SelectItem value="future">
                    {t('edit_scope_future')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="session-tags">{t('tags')}</Label>
            <Input
              id="session-tags"
              value={tagNames}
              onChange={(event) => setTagNames(event.target.value)}
              placeholder={t('tags_placeholder')}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="session-files">{t('attached_files')}</Label>
            <Input
              id="session-files"
              value={filePaths}
              onChange={(event) => setFilePaths(event.target.value)}
              placeholder="user-groups/{groupId}/file.pdf"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="session-description">
              {t('description_markdown')}
            </Label>
            <Textarea
              id="session-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
            />
            {description.trim() && (
              <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border bg-muted/30 p-3">
                <MemoizedReactMarkdown>{description}</MemoizedReactMarkdown>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isPending || !groupId || daysOfWeek.length === 0}
            onClick={handleSubmit}
          >
            {isPending ? commonT('saving') : commonT('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import type { JSONContent } from '@tiptap/react';
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  File,
  FileText,
  Globe,
  Repeat,
  Tags,
  Trash2,
  Upload,
  Users,
} from '@tuturuuu/icons';
import type {
  CreateWorkspaceUserGroupSessionPayload,
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupScheduleGroup,
  WorkspaceUserGroupSession,
  WorkspaceUserGroupSessionDescriptionJson,
} from '@tuturuuu/internal-api';
import { uploadWorkspaceUserGroupStorageFile } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  FileUploader,
  type StatedFile,
} from '@tuturuuu/ui/custom/file-uploader';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useMessages, useTranslations } from 'next-intl';
import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import '@/lib/dayjs-setup';
import { parseCsv, SESSION_EDITOR_DAYS } from './session-editor-utils';
import {
  buildZonedIso,
  DEFAULT_SCHEDULE_TIMEZONE,
  localDateTimeParts,
} from './session-time-utils';
import { SessionTimezoneCombobox } from './session-timezone-combobox';

type SubmitPayload =
  | CreateWorkspaceUserGroupSessionPayload
  | UpdateWorkspaceUserGroupSessionPayload;

type AttachedFileDraft = {
  name?: string | null;
  storagePath: string;
};

const EMPTY_EDITOR_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

type FieldIcon = ComponentType<{ className?: string }>;

const editorScheduleMessageFallbacks = {
  fix_recurring_link: 'Fix recurring link',
  fix_recurring_link_description:
    'Attach this detached session back to a recurring schedule, or convert it into a weekly schedule when no match exists.',
} as const;

type EditorScheduleMessageKey = keyof typeof editorScheduleMessageFallbacks;

function readEditorScheduleMessage(
  messages: unknown,
  key: EditorScheduleMessageKey
) {
  if (messages && typeof messages === 'object') {
    const namespace = (messages as Record<string, unknown>)[
      'ws-user-group-schedule'
    ];
    if (namespace && typeof namespace === 'object') {
      const value = (namespace as Record<string, unknown>)[key];
      if (typeof value === 'string') return value;
    }
  }

  return editorScheduleMessageFallbacks[key];
}

function FieldLabel({
  children,
  htmlFor,
  icon: Icon,
}: {
  children: ReactNode;
  htmlFor?: string;
  icon: FieldIcon;
}) {
  return (
    <Label className="flex items-center gap-2" htmlFor={htmlFor}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {children}
    </Label>
  );
}

function IconInput({
  className,
  icon: Icon,
  ...props
}: ComponentProps<typeof Input> & { icon: FieldIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn('pl-9', className)} {...props} />
    </div>
  );
}

function textToEditorDoc(text: string | null | undefined): JSONContent | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  return {
    type: 'doc',
    content: trimmed.split(/\n{2,}/).map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph }],
    })),
  };
}

function normalizeEditorDoc(
  value:
    | WorkspaceUserGroupSessionDescriptionJson
    | Record<string, unknown>
    | null
    | undefined,
  fallbackText: string | null | undefined
): JSONContent | null {
  if (value && typeof value === 'object') {
    return value as JSONContent;
  }

  return textToEditorDoc(fallbackText);
}

function editorDocToText(value: JSONContent | null | undefined): string {
  if (!value) return '';

  const pieces: string[] = [];
  const visit = (node: JSONContent) => {
    if (typeof node.text === 'string') pieces.push(node.text);
    if (node.type === 'paragraph' || node.type === 'heading') pieces.push('\n');
    node.content?.forEach(visit);
  };

  visit(value);
  return pieces
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pickerDateFromParts(
  date: string,
  time: string,
  timezone: string
): Date {
  return dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', timezone).toDate();
}

function pickerPartsFromDate(value: Date, timezone: string) {
  const zoned = dayjs(value).tz(timezone);
  return {
    date: zoned.format('YYYY-MM-DD'),
    time: zoned.format('HH:mm'),
  };
}

interface SessionEditorDialogProps {
  canChooseGroup: boolean;
  defaultEndsAt?: string;
  defaultGroupId?: string;
  defaultStartsAt?: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  isPending?: boolean;
  onOpenChange?: (open: boolean) => void;
  onReconcile?: (session: WorkspaceUserGroupSession) => Promise<void> | void;
  onSubmit: (payload: SubmitPayload) => Promise<void> | void;
  open?: boolean;
  reconcilePending?: boolean;
  session?: WorkspaceUserGroupSession | null;
  trigger?: ReactNode;
  wsId?: string;
}

export function SessionEditorDialog({
  canChooseGroup,
  defaultEndsAt,
  defaultGroupId,
  defaultStartsAt,
  groups,
  isPending,
  onOpenChange,
  onReconcile,
  onSubmit,
  open: controlledOpen,
  reconcilePending,
  session,
  trigger,
  wsId,
}: SessionEditorDialogProps) {
  const t = useTranslations('ws-user-group-schedule');
  const commonT = useTranslations('common');
  const messages = useMessages();
  const isEditing = !!session;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (value: boolean) => {
    setUncontrolledOpen(value);
    onOpenChange?.(value);
  };
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? '');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('20:30');
  const [timezone, setTimezone] = useState(DEFAULT_SCHEDULE_TIMEZONE);
  const [description, setDescription] = useState('');
  const [descriptionJson, setDescriptionJson] = useState<JSONContent | null>(
    null
  );
  const [tagNames, setTagNames] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileDraft[]>([]);
  const [filesToUpload, setFilesToUpload] = useState<StatedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [untilDate, setUntilDate] = useState('');
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [scope, setScope] = useState<'future' | 'once'>('once');
  const descriptionFlushRef = useRef<(() => JSONContent | null) | undefined>(
    undefined
  );

  useEffect(() => {
    if (!open) return;

    if (session) {
      const parts = localDateTimeParts(session.startsAt, session.startTimezone);
      const endParts = localDateTimeParts(session.endsAt, session.endTimezone);
      setGroupId(session.groupId);
      setDate(parts.date);
      setEndDate(endParts.date);
      setStartTime(parts.time);
      setEndTime(endParts.time);
      setTimezone(session.startTimezone || DEFAULT_SCHEDULE_TIMEZONE);
      setDescription(session.description ?? '');
      setDescriptionJson(
        normalizeEditorDoc(session.descriptionJson, session.description)
      );
      setTagNames(session.tags.map((tag) => tag.name).join(', '));
      setAttachedFiles(
        session.files.map((file) => ({
          name: file.name,
          storagePath: file.storagePath,
        }))
      );
      setFilesToUpload([]);
      setRepeat(false);
      setDaysOfWeek([dayjs(session.startsAt).tz(session.startTimezone).day()]);
      setScope(session.seriesId ? 'future' : 'once');
      return;
    }

    const today = dayjs();
    const defaultStartParts = defaultStartsAt
      ? localDateTimeParts(defaultStartsAt, DEFAULT_SCHEDULE_TIMEZONE)
      : null;
    const defaultEndParts = defaultEndsAt
      ? localDateTimeParts(defaultEndsAt, DEFAULT_SCHEDULE_TIMEZONE)
      : null;
    setGroupId(defaultGroupId ?? groups[0]?.id ?? '');
    const nextDate = defaultStartParts?.date ?? today.format('YYYY-MM-DD');
    setDate(nextDate);
    setEndDate(defaultEndParts?.date ?? nextDate);
    setStartTime(defaultStartParts?.time ?? '19:00');
    setEndTime(defaultEndParts?.time ?? '20:30');
    setTimezone(DEFAULT_SCHEDULE_TIMEZONE);
    setDescription('');
    setDescriptionJson(null);
    setTagNames('');
    setAttachedFiles([]);
    setFilesToUpload([]);
    setRepeat(false);
    setDaysOfWeek([today.day()]);
    setUntilDate(today.add(12, 'month').format('YYYY-MM-DD'));
    setIntervalWeeks(1);
    setScope('once');
  }, [defaultEndsAt, defaultGroupId, defaultStartsAt, groups, open, session]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === groupId),
    [groupId, groups]
  );
  const startDateTime = useMemo(
    () => pickerDateFromParts(date, startTime, timezone),
    [date, startTime, timezone]
  );
  const endDateTime = useMemo(
    () => pickerDateFromParts(endDate, endTime, timezone),
    [endDate, endTime, timezone]
  );
  const canFixRecurringLink = isEditing && !!session && !session.seriesId;
  const scheduleMessage = (key: EditorScheduleMessageKey) =>
    readEditorScheduleMessage(messages, key);

  const handleUpload = async (files: StatedFile[]) => {
    if (!wsId || !groupId || files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadedFiles: AttachedFileDraft[] = [];
      for (const file of files) {
        const result = await uploadWorkspaceUserGroupStorageFile(
          wsId,
          groupId,
          file.rawFile
        );
        uploadedFiles.push({
          name: file.rawFile.name,
          storagePath: result.path,
        });
      }

      setAttachedFiles((current) => [...current, ...uploadedFiles]);
      setFilesToUpload([]);
      toast.success(t('files_uploaded'));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('failed_to_upload_files')
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    const startsAt = buildZonedIso(date, startTime, timezone);
    let endsAt = buildZonedIso(endDate, endTime, timezone);
    if (!dayjs(endsAt).isAfter(dayjs(startsAt))) {
      endsAt = dayjs(endsAt).add(1, 'day').toISOString();
    }

    const nextDescriptionJson =
      descriptionFlushRef.current?.() ?? descriptionJson ?? null;
    const nextDescription =
      editorDocToText(nextDescriptionJson) || description.trim() || null;

    const shared = {
      description: nextDescription,
      descriptionJson:
        (nextDescriptionJson as WorkspaceUserGroupSessionDescriptionJson | null) ??
        null,
      endTimezone: timezone,
      endsAt,
      files: attachedFiles.map((file) => ({
        name: file.name || undefined,
        storagePath: file.storagePath,
      })),
      startTimezone: timezone,
      startsAt,
      tagNames: parseCsv(tagNames),
      title: selectedGroup?.name ?? null,
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

        <Tabs defaultValue="details" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">{t('details_tab')}</TabsTrigger>
            <TabsTrigger value="description">
              {t('description_tab')}
            </TabsTrigger>
            <TabsTrigger value="files">{t('files_tab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-0">
            <div className="grid gap-4 md:grid-cols-2">
              {canChooseGroup && !isEditing ? (
                <div className="space-y-2 md:col-span-2">
                  <FieldLabel icon={Users}>{t('group')}</FieldLabel>
                  <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger>
                      <Users className="h-4 w-4 text-muted-foreground" />
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
              ) : (
                <div className="space-y-2 md:col-span-2">
                  <FieldLabel icon={Users}>{t('group')}</FieldLabel>
                  <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">
                      {selectedGroup?.name ?? t('untitled_session')}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <FieldLabel icon={Globe}>{t('timezone')}</FieldLabel>
                <SessionTimezoneCombobox
                  ariaLabel={t('timezone')}
                  className="h-10 w-full"
                  emptyLabel={t('no_timezones_found')}
                  leadingIcon={<Globe className="h-4 w-4" />}
                  placeholder={DEFAULT_SCHEDULE_TIMEZONE}
                  searchPlaceholder={t('search_timezone')}
                  value={timezone}
                  onValueChange={setTimezone}
                />
              </div>

              <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel icon={Clock}>{t('start_time')}</FieldLabel>
                  <DateTimePicker
                    allowClear={false}
                    date={startDateTime}
                    preferences={{
                      timeFormat: '24h',
                      timezone,
                      weekStartsOn: 1,
                    }}
                    setDate={(value) => {
                      if (!value) return;
                      const parts = pickerPartsFromDate(value, timezone);
                      setDate(parts.date);
                      setStartTime(parts.time);
                    }}
                    showTimeSelect
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel icon={Clock}>{t('end_time')}</FieldLabel>
                  <DateTimePicker
                    allowClear={false}
                    date={endDateTime}
                    preferences={{
                      timeFormat: '24h',
                      timezone,
                      weekStartsOn: 1,
                    }}
                    setDate={(value) => {
                      if (!value) return;
                      const parts = pickerPartsFromDate(value, timezone);
                      setEndDate(parts.date);
                      setEndTime(parts.time);
                    }}
                    showTimeSelect
                  />
                </div>
              </div>

              {!isEditing && (
                <div className="space-y-3 rounded-md border p-3 md:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Repeat className="h-4 w-4 text-muted-foreground" />
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
                                    : current.filter(
                                        (value) => value !== day.value
                                      )
                                )
                              }
                            />
                            {commonT(day.labelKey)}
                          </label>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <FieldLabel icon={Repeat}>
                          {t('interval_weeks')}
                        </FieldLabel>
                        <IconInput
                          icon={Repeat}
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
                        <FieldLabel icon={CalendarDays}>
                          {t('until_date')}
                        </FieldLabel>
                        <DateTimePicker
                          allowClear={false}
                          date={pickerDateFromParts(
                            untilDate || date,
                            '00:00',
                            timezone
                          )}
                          preferences={{
                            timeFormat: '24h',
                            timezone,
                            weekStartsOn: 1,
                          }}
                          setDate={(value) => {
                            if (!value) return;
                            setUntilDate(
                              dayjs(value).tz(timezone).format('YYYY-MM-DD')
                            );
                          }}
                          showTimeSelect={false}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isEditing && session?.seriesId && (
                <div className="space-y-2 md:col-span-2">
                  <FieldLabel icon={Repeat}>{t('edit_scope')}</FieldLabel>
                  <Select
                    value={scope}
                    onValueChange={(value) =>
                      setScope(value as 'future' | 'once')
                    }
                  >
                    <SelectTrigger>
                      <Repeat className="h-4 w-4 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">
                        {t('edit_scope_once')}
                      </SelectItem>
                      <SelectItem value="future">
                        {t('edit_scope_future')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <FieldLabel htmlFor="session-tags" icon={Tags}>
                  {t('tags')}
                </FieldLabel>
                <IconInput
                  id="session-tags"
                  icon={Tags}
                  value={tagNames}
                  onChange={(event) => setTagNames(event.target.value)}
                  placeholder={t('tags_placeholder')}
                />
              </div>

              {canFixRecurringLink && onReconcile && (
                <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between md:col-span-2">
                  <div className="flex min-w-0 gap-3">
                    <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">
                        {scheduleMessage('fix_recurring_link')}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {scheduleMessage('fix_recurring_link_description')}
                      </div>
                    </div>
                  </div>
                  <Button
                    className="shrink-0"
                    disabled={reconcilePending || isPending}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (session) void onReconcile(session);
                    }}
                  >
                    <Repeat className="h-4 w-4" />
                    {scheduleMessage('fix_recurring_link')}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="description" className="mt-0">
            <div className="space-y-2">
              <FieldLabel icon={FileText}>{t('description_tab')}</FieldLabel>
              <RichTextEditor
                content={descriptionJson ?? EMPTY_EDITOR_DOC}
                flushPendingRef={descriptionFlushRef}
                onChange={(content) => {
                  setDescriptionJson(content);
                  setDescription(editorDocToText(content));
                }}
                onImmediateChange={(content) => {
                  setDescriptionJson(content);
                }}
                titlePlaceholder={selectedGroup?.name ?? t('untitled_session')}
                writePlaceholder={t('description_placeholder')}
                workspaceId={wsId}
              />
            </div>
          </TabsContent>

          <TabsContent value="files" className="mt-0 space-y-4">
            <FileUploader
              value={filesToUpload}
              onValueChange={setFilesToUpload}
              onUpload={handleUpload}
              multiple
              maxFileCount={8}
              maxSize={50 * 1024 * 1024}
              disabled={!wsId || !groupId || isUploading}
            />

            {attachedFiles.length ? (
              <div className="divide-y rounded-md border">
                {attachedFiles.map((file, index) => (
                  <div
                    key={`${file.storagePath}-${index}`}
                    className="flex items-center gap-3 p-3"
                  >
                    <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-sm">
                        {file.name || file.storagePath.split('/').pop()}
                      </div>
                      <div className="truncate text-muted-foreground text-xs">
                        {file.storagePath}
                      </div>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                    >
                      <a
                        href={
                          wsId && groupId
                            ? `/${wsId}/users/groups/${groupId}/storage`
                            : '#'
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('open_file')}
                      </a>
                    </Button>
                    <Button
                      aria-label={t('unlink_file')}
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setAttachedFiles((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
                <Upload className="h-5 w-5" />
                {t('no_attached_files')}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            disabled={
              isPending || isUploading || !groupId || daysOfWeek.length === 0
            }
            onClick={handleSubmit}
          >
            {isPending ? commonT('saving') : commonT('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import type { JSONContent } from '@tiptap/react';
import { CalendarPlus, File, Trash2, Upload } from '@tuturuuu/icons';
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
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
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

type AttachedFileDraft = {
  name?: string | null;
  storagePath: string;
};

const EMPTY_EDITOR_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

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

interface SessionEditorDialogProps {
  canChooseGroup: boolean;
  defaultEndsAt?: string;
  defaultGroupId?: string;
  defaultStartsAt?: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  isPending?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (payload: SubmitPayload) => Promise<void> | void;
  open?: boolean;
  session?: WorkspaceUserGroupSession | null;
  trigger?: React.ReactNode;
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
  onSubmit,
  open: controlledOpen,
  session,
  trigger,
  wsId,
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
      setTitle(session.title ?? '');
      setDate(parts.date);
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
    setTitle('');
    setDate(defaultStartParts?.date ?? today.format('YYYY-MM-DD'));
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
    let endsAt = buildZonedIso(date, endTime, timezone);
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
                    onValueChange={(value) =>
                      setScope(value as 'future' | 'once')
                    }
                  >
                    <SelectTrigger>
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
                <Label htmlFor="session-tags">{t('tags')}</Label>
                <Input
                  id="session-tags"
                  value={tagNames}
                  onChange={(event) => setTagNames(event.target.value)}
                  placeholder={t('tags_placeholder')}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="description" className="mt-0">
            <div className="space-y-2">
              <Label>{t('description_tab')}</Label>
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
                titlePlaceholder={t('session_title')}
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

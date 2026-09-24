'use client';
import { useMutation } from '@tanstack/react-query';
import { createMeetFollowup, InternalApiError } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { FollowupConflicts } from './followup-conflicts';
import { FollowupDestination } from './followup-destination';
import { FollowupPicker } from './followup-picker';
import { buildFollowupPayload, type FollowupSaveInput } from './followup-save';
import { suggestedLocalTime } from './followup-time';
import type { MeetingFollowup } from './followup-types';
import type { useFollowupContext } from './use-followup-context';

export function FollowupReviewForm({
  suggestion,
  sourceUrl,
  wsId,
  meetingId,
  onClose,
  context,
}: {
  suggestion: MeetingFollowup;
  sourceUrl: string;
  wsId: string;
  meetingId: string;
  onClose: () => void;
  context: ReturnType<typeof useFollowupContext>;
}) {
  const t = useTranslations('meet.ai');
  const { profile, workspaces, settings } = context;
  const [title, setTitle] = useState(suggestion.title);
  const [timezone, setTimezone] = useState(() =>
    settings.data?.timezone && settings.data.timezone !== 'auto'
      ? settings.data.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [start, setStart] = useState(() =>
    suggestedLocalTime(suggestion.startLocal, suggestion.timezone, timezone)
  );
  const [end, setEnd] = useState(() =>
    suggestedLocalTime(suggestion.endLocal, suggestion.timezone, timezone)
  );
  const [due, setDue] = useState('');
  const [destination, setDestination] = useState('personal');
  const [boardId, setBoardId] = useState('');
  const [listId, setListId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [calendarId, setCalendarId] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState<
    'low' | 'normal' | 'high' | 'critical'
  >('normal');
  const [description, setDescription] = useState(suggestion.evidence);
  const [validationError, setValidationError] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const busy = useRef(false);
  const workspaceId =
    destination === 'personal'
      ? workspaces.data?.find((workspace) => workspace.personal)?.id
      : destination;
  const mutation = useMutation({
    mutationFn: (input: FollowupSaveInput) =>
      createMeetFollowup(wsId, meetingId, {
        ...input,
        boardId,
        requestId: crypto.randomUUID(),
        startedAt: Date.now(),
      }).then((result) => result.url),
    retry: false,
  });
  const user = profile.data;
  const task = suggestion.kind === 'task';
  const destinationUrl = `https://${task ? 'tasks' : 'calendar'}.tuturuuu.com/${encodeURIComponent(workspaceId ?? 'personal')}`;
  const submit = async () => {
    if (!user || !workspaceId || busy.current) return;
    setValidationError(false);
    setRejected(false);
    const input = {
      kind: suggestion.kind,
      title,
      description: `${description}\n\n${sourceUrl}`,
      workspaceId,
      userId: user.id,
      listId,
      timezone,
      start,
      end,
      due,
      assignToMe: false,
      assigneeIds,
      priority,
      calendarId: calendarId || undefined,
      location,
    };
    try {
      buildFollowupPayload(input);
    } catch {
      setValidationError(true);
      return;
    }
    // Persist a receipt before sending. An interrupted request must not be retried blindly.
    const key = `meet-followup:${user.id}:${suggestion.key}`;
    busy.current = true;
    try {
      const receipt = localStorage.getItem(key);
      if (receipt) {
        try {
          const saved = JSON.parse(receipt);
          if (
            saved.status === 'saved' &&
            typeof saved.url === 'string' &&
            /^https:\/\/(tasks|calendar)\.tuturuuu\.com\//.test(saved.url)
          ) {
            setSavedUrl(saved.url);
            return;
          }
        } catch {
          /* Pending or unreadable receipts require checking the destination. */
        }
        setUncertain(true);
        return;
      }
      localStorage.setItem(key, 'pending');
      const url = await mutation.mutateAsync(input);
      setSavedUrl(url);
      localStorage.setItem(key, JSON.stringify({ status: 'saved', url }));
    } catch (error) {
      if (
        error instanceof InternalApiError &&
        error.code === 'FOLLOWUP_NOT_SAVED'
      ) {
        try {
          localStorage.removeItem(key);
          setRejected(true);
        } catch {
          setUncertain(true);
        }
      } else setUncertain(true);
    } finally {
      busy.current = false;
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t(task ? 'followup_review_task' : 'followup_review_event')}
          </DialogTitle>
          <DialogDescription>{t('followup_review_hint')}</DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap rounded-md border p-3 text-sm">
          {suggestion.evidence}
        </p>
        {(suggestion.owner || suggestion.timeText) && (
          <p className="text-muted-foreground text-sm">
            {[suggestion.owner, suggestion.timeText]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {profile.isError || workspaces.isError ? (
          <p role="alert">{t('followup_identity_failed')}</p>
        ) : !user || !workspaces.data ? (
          <p role="status">{t('loading')}</p>
        ) : (
          <>
            <p className="break-words text-sm">
              {t('followup_identity', {
                name: user.display_name || user.email || user.id,
              })}
            </p>
            <fieldset
              disabled={mutation.isPending || !!savedUrl || uncertain}
              className="space-y-4"
            >
              <div className="space-y-1">
                <Label htmlFor="followup-title">{t('followup_title')}</Label>
                <Input
                  id="followup-title"
                  value={title}
                  maxLength={255}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="followup-description">
                  {t('followup_description')}
                </Label>
                <Textarea
                  id="followup-description"
                  value={description}
                  maxLength={9000}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                />
              </div>
              <FollowupPicker
                id="followup-workspace"
                label={t('followup_workspace')}
                value={destination}
                options={[
                  { id: 'personal', label: t('followup_personal') },
                  ...workspaces.data
                    .filter(
                      (workspace) =>
                        !workspace.personal &&
                        workspace.access_type === 'member'
                    )
                    .map((workspace) => ({
                      id: workspace.id,
                      label: workspace.name || workspace.id,
                    })),
                ]}
                onChange={(value) => {
                  setDestination(value);
                  setBoardId('');
                  setListId('');
                  setAssigneeIds([]);
                  setCalendarId('');
                }}
              />
              {workspaceId && (
                <FollowupDestination
                  workspaceId={workspaceId}
                  sourceWsId={wsId}
                  meetingId={meetingId}
                  boardId={boardId}
                  listId={listId}
                  onBoard={setBoardId}
                  onList={setListId}
                  task={task}
                  assigneeIds={assigneeIds}
                  onAssignees={setAssigneeIds}
                  calendarId={calendarId}
                  onCalendar={setCalendarId}
                  suggestion={suggestion}
                  userId={user.id}
                />
              )}
              <div className="space-y-1">
                <Label htmlFor="followup-timezone">
                  {t('followup_timezone')}
                </Label>
                <Input
                  id="followup-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {t('followup_timezone_hint')}
                </p>
              </div>
              {task ? (
                <div className="space-y-1">
                  <Label htmlFor="followup-due">{t('followup_due')}</Label>
                  <Input
                    id="followup-due"
                    type="datetime-local"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="followup-start">
                      {t('followup_start')}
                    </Label>
                    <Input
                      id="followup-start"
                      type="datetime-local"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="followup-end">{t('followup_end')}</Label>
                    <Input
                      id="followup-end"
                      type="datetime-local"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {task ? (
                <div className="space-y-1">
                  <Label htmlFor="followup-priority">
                    {t('followup_priority')}
                  </Label>
                  <Select
                    value={priority}
                    onValueChange={(value) =>
                      setPriority(value as typeof priority)
                    }
                  >
                    <SelectTrigger id="followup-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['low', 'normal', 'high', 'critical'] as const).map(
                        (value) => (
                          <SelectItem key={value} value={value}>
                            {t(`followup_priority_${value}`)}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="followup-location">
                    {t('followup_location')}
                  </Label>
                  <Input
                    id="followup-location"
                    value={location}
                    maxLength={1000}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </div>
              )}
              {!task && (
                <FollowupConflicts
                  wsId={wsId}
                  meetingId={meetingId}
                  workspaceId={workspaceId}
                  timezone={timezone}
                  start={start}
                  end={end}
                />
              )}
              <Button
                className="w-full"
                disabled={
                  !workspaceId ||
                  !title.trim() ||
                  (task ? !listId : !calendarId || !start || !end)
                }
                onClick={() => void submit()}
              >
                {t(
                  mutation.isPending
                    ? 'processing'
                    : task
                      ? 'followup_create_task'
                      : 'followup_create_event'
                )}
              </Button>
            </fieldset>
          </>
        )}
        {validationError && (
          <p role="alert" className="text-destructive text-sm">
            {t('followup_invalid_time')}
          </p>
        )}
        {rejected && <p role="alert">{t('followup_not_saved')}</p>}
        {uncertain && (
          <p role="alert" className="text-sm">
            {t('followup_check_destination')}
          </p>
        )}
        {savedUrl && (
          <p role="status" className="text-sm">
            {t('followup_saved')}
          </p>
        )}
        <Button variant="outline" asChild>
          <a
            href={savedUrl ?? destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t(task ? 'followup_open_tasks' : 'followup_open_calendar')}
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}

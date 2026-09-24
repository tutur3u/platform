'use client';

import { LogIn, Video } from '@tuturuuu/icons';
import {
  CalendarClock,
  ChevronDownIcon,
  ExternalLink,
} from '@tuturuuu/icons/lucide-static';
import { createWorkspaceMeeting } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { parseMeetingCode } from '../lib/meeting-code-input';
import { normalizeMeetingTime } from '../lib/meeting-time';
import { encodeRoomCode } from '../lib/room-code';

type CreatedMeeting = {
  meeting: { id: string };
  calendarEvent?: { id: string; start_at: string; end_at: string; url: string };
};

function defaultScheduledTime() {
  const value = new Date(Date.now() + 60 * 60 * 1000);
  value.setMinutes(Math.ceil(value.getMinutes() / 15) * 15, 0, 0);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function MeetingEntry({
  canCreate,
  onCreated,
  wsId,
}: {
  canCreate: boolean;
  onCreated: () => void;
  wsId: string;
}) {
  const t = useTranslations('meet.meetings');
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const durationRef = useRef<HTMLInputElement>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startMeeting = async () => {
    if (busy || !canCreate) return;
    setBusy(true);
    try {
      const response = await createWorkspaceMeeting<CreatedMeeting>(wsId, {
        name: t('untitled'),
        time: new Date().toISOString(),
      });
      router.push(`/r/${encodeRoomCode(response.meeting.id)}`);
    } catch {
      toast.error(t('create_failed'));
    } finally {
      setBusy(false);
    }
  };

  const scheduleMeeting = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !canCreate) return;
    const name = nameRef.current?.value.trim();
    const localTime = timeRef.current?.value;
    const duration = Number(durationRef.current?.value || 60);
    if (!name) {
      setError(t('name_required'));
      return;
    }
    if (!localTime || !Number.isFinite(duration) || duration < 15) {
      setError(t('schedule_invalid'));
      return;
    }

    const startAt = normalizeMeetingTime(localTime);
    const endDate = new Date(new Date(startAt).getTime() + duration * 60_000);
    if (Number.isNaN(endDate.getTime())) {
      setError(t('schedule_invalid'));
      return;
    }
    const endAt = endDate.toISOString();
    setBusy(true);
    setError(null);
    try {
      const response = await createWorkspaceMeeting<CreatedMeeting>(wsId, {
        name,
        time: startAt,
        schedule: { endTime: endAt },
      });
      setScheduleOpen(false);
      onCreated();
      toast.success(t('scheduled'), {
        action: response.calendarEvent
          ? {
              label: t('open_calendar'),
              onClick: () =>
                window.open(
                  response.calendarEvent?.url,
                  '_blank',
                  'noopener,noreferrer'
                ),
            }
          : undefined,
      });
    } catch {
      setError(t('schedule_failed'));
    } finally {
      setBusy(false);
    }
  };

  const joinMeeting = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const meetingId = parseMeetingCode(code, window.location.origin);
    if (!meetingId) {
      setError(t('invalid_code'));
      return;
    }
    router.push(`/r/${encodeRoomCode(meetingId)}`);
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex items-center">
        <Button
          className="rounded-r-none pr-3"
          disabled={!canCreate || busy}
          onClick={() => void startMeeting()}
          size="sm"
        >
          <Video className="size-4" />
          {busy ? t('creating') : t('create')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t('create_options')}
              className="rounded-l-none border-l border-l-primary-foreground/25 px-2"
              disabled={!canCreate || busy}
              size="sm"
            >
              <ChevronDownIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
              <CalendarClock className="size-4" />
              <div>
                <div className="font-medium">{t('schedule_later')}</div>
                <div className="text-muted-foreground text-xs">
                  {t('schedule_later_hint')}
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog
        open={scheduleOpen}
        onOpenChange={(open) => {
          setScheduleOpen(open);
          setError(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarClock className="size-5" />
            </div>
            <DialogTitle>{t('schedule_title')}</DialogTitle>
            <DialogDescription>{t('schedule_description')}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={scheduleMeeting}>
            <div className="space-y-2">
              <Label htmlFor="meeting-name">{t('name')}</Label>
              <Input
                autoFocus
                id="meeting-name"
                placeholder={t('name_placeholder')}
                ref={nameRef}
                required
              />
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="space-y-2">
                <Label htmlFor="meeting-time">{t('time')}</Label>
                <Input
                  defaultValue={defaultScheduledTime()}
                  id="meeting-time"
                  ref={timeRef}
                  required
                  type="datetime-local"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-duration">{t('duration')}</Label>
                <Input
                  defaultValue="60"
                  id="meeting-duration"
                  min="15"
                  ref={durationRef}
                  required
                  step="15"
                  type="number"
                />
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <ExternalLink className="size-3.5" />
              {t('calendar_hint')}
            </p>
            {error && (
              <p className="text-dynamic-red text-sm" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t('cancel')}
                </Button>
              </DialogClose>
              <Button disabled={busy} type="submit">
                {busy ? t('scheduling') : t('schedule')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={joinOpen}
        onOpenChange={(open) => {
          setJoinOpen(open);
          setError(null);
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <LogIn className="size-4" />
            {t('join')}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
              <LogIn className="size-5" />
            </div>
            <DialogTitle>{t('join_title')}</DialogTitle>
            <DialogDescription>{t('join_description')}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={joinMeeting}>
            <div className="space-y-2">
              <Label htmlFor="join-code">{t('meeting_code')}</Label>
              <Input
                autoFocus
                id="join-code"
                onChange={(event) => setCode(event.target.value)}
                placeholder={t('code_placeholder')}
                value={code}
              />
            </div>
            {error && (
              <p className="text-dynamic-red text-sm" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t('cancel')}
                </Button>
              </DialogClose>
              <Button disabled={!code.trim()} type="submit">
                {t('join')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

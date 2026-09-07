'use client';

import { LogIn, Plus, Video } from '@tuturuuu/icons';
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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { parseMeetingCode } from '../lib/meeting-code-input';
import { normalizeMeetingTime } from '../lib/meeting-time';
import { encodeRoomCode } from '../lib/room-code';

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
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMeeting = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !canCreate) return;
    const name = nameRef.current?.value.trim();
    if (!name) {
      setError(t('name_required'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const time = timeRef.current?.value || new Date().toISOString();
      await createWorkspaceMeeting(wsId, {
        name,
        time: normalizeMeetingTime(time),
      });
      setCreateOpen(false);
      onCreated();
    } catch {
      setError(t('create_failed'));
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
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          setError(null);
        }}
      >
        <DialogTrigger asChild>
          <Button disabled={!canCreate} size="sm">
            <Plus className="size-4" />
            {t('create')}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Video className="size-5" />
            </div>
            <DialogTitle>{t('create_title')}</DialogTitle>
            <DialogDescription>{t('create_description')}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createMeeting}>
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
            <div className="space-y-2">
              <Label htmlFor="meeting-time">{t('time')}</Label>
              <Input id="meeting-time" ref={timeRef} type="datetime-local" />
              <p className="text-muted-foreground text-xs">{t('time_hint')}</p>
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
              <Button disabled={busy} type="submit">
                {busy ? t('creating') : t('create')}
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

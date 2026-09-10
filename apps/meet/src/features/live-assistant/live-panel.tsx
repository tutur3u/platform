'use client';
import {
  Brain,
  Headphones,
  LockKeyhole,
  Mic,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  Square,
  Users,
} from '@tuturuuu/icons';
import type { MeetLiveVoice } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
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
import { useEffect, useRef, useState } from 'react';
import { AssistantWorkspacePicker } from '../call/components/assistant-workspace-picker';
import { MiraAvatar } from '../call/components/mira-profile';
import type { MeetRoomController } from '../call/lib/room-controller';
import { liveVoiceSchema } from './contracts';
import { LiveReviewCard } from './live-review-card';
import { useLiveAssistant } from './use-live-assistant';

export function MeetLivePanel({
  room,
  meetingId,
  outputDeviceId,
  canManage,
}: {
  room: MeetRoomController;
  meetingId: string;
  outputDeviceId: string;
  canManage: boolean;
}) {
  const t = useTranslations('meet.live');
  const streams = [
    room.localStream,
    ...Object.values(room.remoteStreams),
  ].filter((stream): stream is MediaStream => !!stream);
  const live = useLiveAssistant(
    meetingId,
    outputDeviceId,
    {
      streams,
      microphoneEnabled: room.media.audioEnabled,
    },
    room.getSelectedDevices().audio
  );
  const [draft, setDraft] = useState('');
  const [workspace, setWorkspace] = useState('personal');
  const [voice, setVoice] = useState<MeetLiveVoice>('Aoede');
  const active = !['idle', 'error', 'ended'].includes(live.status);
  const ready = ['listening', 'paused'].includes(live.status);
  // If the user unmutes the meeting, stop personal capture before any further audio is sent.
  useEffect(() => {
    if (active && live.mode === 'personal' && room.media.audioEnabled)
      live.send({ type: 'pause', paused: true });
  }, [active, live.mode, room.media.audioEnabled, live.send]);
  const currentRoom = useRef(room);
  currentRoom.current = room;
  const start = async (mode: 'personal' | 'room') => {
    const restoreMicrophone = mode === 'personal' && room.media.audioEnabled;
    if (restoreMicrophone) await room.toggleMicrophone();
    const started = await live.start(
      mode,
      streams,
      room.getSelectedDevices().audio,
      workspace === 'personal' ? undefined : workspace,
      voice
    );
    if (
      !started &&
      restoreMicrophone &&
      !currentRoom.current.media.audioEnabled
    )
      await currentRoom.current.toggleMicrophone();
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={active ? 'secondary' : 'outline'}
          size="sm"
          className="gap-2 rounded-full"
        >
          <MiraAvatar size={18} />
          <span>{t('title')}</span>
          {active && <Radio className="size-3.5 motion-safe:animate-pulse" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MiraAvatar />
            {t('title')}
            <ShieldCheck className="size-4 text-muted-foreground" />
          </DialogTitle>
          <DialogDescription>{t('hint')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          {!active && (
            <AssistantWorkspacePicker
              selfUserId={room.state.selfUserId}
              value={workspace}
              onChange={setWorkspace}
            />
          )}
          {!active && (
            <div className="space-y-2">
              <Label>{t('voice')}</Label>
              <Select
                value={voice}
                onValueChange={(value) =>
                  setVoice(liveVoiceSchema.parse(value))
                }
              >
                <SelectTrigger aria-label={t('voice')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {liveVoiceSchema.options.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!active ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="space-y-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => void start('personal')}
              >
                <Headphones className="size-6" />
                <strong className="block">{t('personal')}</strong>
                <span className="block text-muted-foreground text-sm">
                  {t('personal_hint')}
                </span>
              </button>
              {canManage && (
                <button
                  type="button"
                  className="space-y-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void start('room')}
                >
                  <Users className="size-6" />
                  <strong className="block">{t('room')}</strong>
                  <span className="block text-muted-foreground text-sm">
                    {t('room_hint')}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  {live.mode === 'personal' ? (
                    <LockKeyhole className="size-3" />
                  ) : (
                    <Users className="size-3" />
                  )}
                  {t(live.mode === 'personal' ? 'only_you' : 'everyone')}
                </Badge>
                <Badge variant="outline">
                  {t(
                    `state_${live.status as 'connecting' | 'listening' | 'paused' | 'recovering'}`
                  )}
                </Badge>
                {live.organized && (
                  <Badge variant="outline" className="gap-1">
                    <Brain className="size-3" />
                    {t('organized')}
                  </Badge>
                )}
              </div>
              <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground text-xs">
                {t(
                  live.mode === 'personal'
                    ? 'private_mic_hint'
                    : 'room_consent_hint'
                )}
              </p>
              <div className="space-y-3" aria-live="polite">
                {live.transcript.map((turn, index) => (
                  <div
                    key={`${index}-${turn.role}`}
                    className="rounded-lg bg-muted/30 p-3"
                  >
                    <span className="font-medium text-xs">
                      {turn.role === 'assistant' ? 'Mira' : t('you')}
                    </span>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                      {turn.text}
                    </p>
                  </div>
                ))}
              </div>
              {live.reviews.map((review) => (
                <LiveReviewCard
                  key={review.id}
                  review={review}
                  ready={ready}
                  decide={live.decide}
                />
              ))}
              <div className="flex items-end gap-2">
                <Textarea
                  aria-label={t('message')}
                  placeholder={t('message')}
                  value={draft}
                  maxLength={4000}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <Button
                  disabled={!draft.trim() || !ready}
                  onClick={() => {
                    live.send({ type: 'text', text: draft });
                    setDraft('');
                  }}
                >
                  <Play className="size-4" />
                  {t('send')}
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <Button
                  variant="outline"
                  disabled={live.mode === 'personal' && room.media.audioEnabled}
                  onClick={() =>
                    live.send({
                      type: 'pause',
                      paused: live.status !== 'paused',
                    })
                  }
                >
                  {live.status === 'paused' ? (
                    <Mic className="size-4" />
                  ) : (
                    <Pause className="size-4" />
                  )}
                  {t(live.status === 'paused' ? 'resume' : 'pause')}
                </Button>
                <Button variant="destructive" onClick={() => void live.stop()}>
                  <Square className="size-4" />
                  {t('stop')}
                </Button>
              </div>
            </>
          )}
          {live.error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm"
            >
              {t('session_error')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

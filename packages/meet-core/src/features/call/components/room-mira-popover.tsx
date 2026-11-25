'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AudioLines, Power } from '@tuturuuu/icons';
import { confirmMeetMiraAccount } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Switch } from '@tuturuuu/ui/switch';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { useLiveSession } from '../../live-assistant/live-session-store';
import { MiraAbout } from './mira-about';
import { MiraConfirmDialog } from './mira-confirm-dialog';
import { MiraPrivateEntry } from './mira-private-entry';
import { ReportMinor } from './mira-report-minor';
import { RoomMiraChip } from './room-mira-chip';
import { useMiraAutoOn } from './use-mira-auto-on';
import { roomMiraConsentKey, useRoomMira } from './use-room-mira';

export function RoomMiraPopover({
  meetingId,
  accountId,
  acceptanceEventId,
}: {
  meetingId: string;
  accountId?: string;
  acceptanceEventId?: string;
}) {
  const t = useTranslations('meet.mira_consent');
  const live = useTranslations('meet.live');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const mira = useRoomMira(meetingId, accountId);
  const data = mira.data;
  const status = data?.accountConfirmation;
  const active = data?.acceptance;
  const session = useLiveSession(meetingId, accountId);
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<'host' | 'personal' | null>(null);
  const choiceId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const focusElsewhere = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const prompted =
    !!accountId &&
    status === 'required' &&
    !!active &&
    data?.lastChoice !== 'off' &&
    !dismissed;
  const on = data?.choice === 'on' && !data.pausing;
  const busy = mira.choosing || mira.turningOn || !!data?.pausing;
  const canEnable =
    !!accountId && (status === 'required' || status === 'confirmed');

  // The room broadcasts its acceptance changes through the existing chat
  // notice stream. Polling still covers reconnects and missing notices.
  useEffect(() => {
    if (acceptanceEventId)
      void queryClient.invalidateQueries({
        queryKey: roomMiraConsentKey(meetingId),
      });
  }, [acceptanceEventId, meetingId, queryClient]);

  const { mutate: choose } = mira.choose;
  useMiraAutoOn({
    meetingId,
    accountId,
    mira,
    deferred: dismissed || !!intent,
  });

  const confirm = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error('Mira account is unavailable');
      if (status === 'required') {
        const next = await confirmMeetMiraAccount(meetingId, accountId, locale);
        queryClient.setQueryData(roomMiraConsentKey(meetingId), next);
      }
      if (intent === 'host') await mira.acceptance.mutateAsync('accept');
      if (intent === 'personal')
        await mira.choose.mutateAsync({ choice: 'on', source: 'toggle' });
    },
    onSuccess: () => {
      setDismissed(false);
      setIntent(null);
    },
  });
  const openDialog = (next: 'host' | 'personal') => {
    confirm.reset();
    focusElsewhere.current = true;
    setOpen(false);
    setIntent(next);
  };
  const dismiss = () => {
    if (intent !== 'host' && active) setDismissed(true);
    setIntent(null);
  };
  if (!active && !data?.canAccept && !session) return null;
  const label = active
    ? t('status_by', { name: active.acceptorName })
    : t('status_off');
  const personalStatus = data?.pausing
    ? 'pausing'
    : busy
      ? 'turning_on'
      : on
        ? 'status_transcript_paused'
        : 'status_off_for_you';
  return (
    <>
      <RoomMiraChip
        state={on ? 'on' : busy ? 'pausing' : 'off'}
        title={live('title')}
        open={open}
        onOpenChange={setOpen}
        triggerRef={trigger}
        onCloseAutoFocus={(event) => {
          if (focusElsewhere.current) event.preventDefault();
          focusElsewhere.current = false;
        }}
      >
        <div role="status" className="flex items-center gap-2 font-medium">
          <span
            aria-hidden
            className={
              active
                ? 'size-2 shrink-0 rounded-full bg-primary'
                : 'size-2 shrink-0 rounded-full bg-muted-foreground'
            }
          />
          <span className="min-w-0 flex-1 break-words">{label}</span>
          {active && (!on || mira.noticeStale) && (
            <Badge variant="secondary" className="shrink-0">
              {t(personalStatus)}
            </Badge>
          )}
        </div>
        {active && (
          <label
            htmlFor={choiceId}
            className="flex min-h-8 items-center gap-2 text-sm pointer-coarse:min-h-11"
          >
            <AudioLines aria-hidden className="size-4 shrink-0" />
            <span className="flex-1">{t('personal_switch')}</span>
            <Switch
              id={choiceId}
              checked={on}
              disabled={busy || (on ? false : !canEnable || !mira.noticeKnown)}
              onCheckedChange={(value) => {
                if (value && status === 'required') openDialog('personal');
                else {
                  setDismissed(false);
                  choose({ choice: value ? 'on' : 'off', source: 'toggle' });
                }
              }}
            />
          </label>
        )}
        {session && (
          <MiraPrivateEntry
            session={session}
            compact
            onOpen={() => {
              focusElsewhere.current = true;
              trigger.current?.focus();
              setOpen(false);
              session.controls.openConsent();
            }}
          />
        )}
        {data?.canAccept && (
          <section
            aria-label={t('host_section')}
            className="space-y-2 border-t pt-2"
          >
            <p className="font-medium text-muted-foreground text-xs">
              {t('host_section')}
            </p>
            <Button
              type="button"
              size="sm"
              variant={active ? 'destructive' : 'outline'}
              className="w-full justify-start pointer-coarse:h-11"
              disabled={mira.acceptance.isPending || (!active && !canEnable)}
              onClick={() =>
                active ? mira.acceptance.mutate('turn_off') : openDialog('host')
              }
            >
              <Power aria-hidden className="size-4" />
              {t(active ? 'host_turn_off' : 'host_turn_on')}
            </Button>
          </section>
        )}
        <MiraAbout mode={mira.noticeMode} showAdultNotice={false}>
          {active && <ReportMinor mira={mira} />}
        </MiraAbout>
      </RoomMiraChip>
      <MiraConfirmDialog
        open={prompted || intent !== null}
        host={intent === 'host'}
        account={status === 'required'}
        pending={confirm.isPending}
        failed={confirm.isError}
        onConfirm={() => confirm.mutate()}
        onDismiss={dismiss}
        returnFocus={() => trigger.current?.focus()}
      />
    </>
  );
}

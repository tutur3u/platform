'use client';

import {
  Check,
  Loader2,
  Lock,
  Pause,
  Power,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { useLiveSession } from '../../live-assistant/live-session-store';
import { MiraConsentBox } from '../../live-assistant/mira-consent-box';
import { MiraAbout } from './mira-about';
import { MiraPrivateEntry } from './mira-private-entry';
import { RoomMiraChip, type RoomMiraChipState } from './room-mira-chip';
import {
  type RoomMiraAvailable,
  roomMiraConsentKey,
  useRoomMira,
} from './use-room-mira';

export { roomMiraConsentKey };

/**
 * The one Mira control in the call header, for every admitted participant.
 * While an acceptance is current it always names who turned Mira on (its
 * accessible name and the popover's first line), and it opens on its own until
 * this person confirms. The popover holds the participant's choice, who is
 * using Mira privately, the host's turn-off and About Mira, which gathers
 * every notice.
 */
export function RoomMiraNotice({
  meetingId,
  accountId,
  privateUsers = [],
}: {
  meetingId: string;
  /** The signed-in account, so the control can open its Private Assistant. */
  accountId?: string;
  /** People using Mira privately; it hears only their own microphone. */
  privateUsers?: readonly { userId: string; displayName: string }[];
}) {
  const t = useTranslations('meet.mira_consent');
  const tl = useTranslations('meet.live');
  const mira = useRoomMira(meetingId);
  const [open, setOpen] = useState<boolean | null>(null);
  const session = useLiveSession(meetingId, accountId);
  const trigger = useRef<HTMLButtonElement>(null);
  const data = mira.data;
  // Focus returns to the control, then the assistant's dialog opens.
  const privateEntry = session && (
    <MiraPrivateEntry
      session={session}
      onOpen={() => {
        trigger.current?.focus();
        setOpen(false);
        session.controls.openConsent();
      }}
    />
  );
  // Without room Mira only an acceptor, or someone with a Private Assistant,
  // sees the control.
  if (!data || (!data.acceptance && !data.canAccept && !session)) return null;
  const privateList = privateUsers.length > 0 && (
    <ul className="space-y-1 text-muted-foreground text-xs">
      {privateUsers.map((person) => (
        <li key={person.userId} role="status" className="flex gap-1.5">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {tl('phase_private_indicator', { name: person.displayName })}
        </li>
      ))}
    </ul>
  );
  if (!data.acceptance && !data.canAccept)
    return (
      <RoomMiraChip
        state="off"
        title={tl('title')}
        open={open ?? false}
        onOpenChange={setOpen}
        triggerRef={trigger}
      >
        {privateEntry}
        <MiraAbout />
      </RoomMiraChip>
    );
  if (!data.acceptance)
    return (
      <RoomMiraChip
        state="host"
        title={t('host_turn_on')}
        open={open ?? false}
        onOpenChange={setOpen}
        triggerRef={trigger}
      >
        <p className="font-medium">{t('host_title')}</p>
        <HostAcceptance mira={mira} />
        {privateEntry}
        <MiraAbout />
      </RoomMiraChip>
    );
  const state: RoomMiraChipState = data.pausing
    ? 'pausing'
    : data.choice === 'on'
      ? 'on'
      : data.choice === 'off'
        ? 'off'
        : 'choose';
  const label = t('indicator_on', { name: data.acceptance.acceptorName });
  return (
    <RoomMiraChip
      state={state}
      title={label}
      description={t(
        state === 'pausing'
          ? 'pausing'
          : state === 'on'
            ? 'you_on'
            : state === 'off'
              ? 'you_off'
              : 'you_choose'
      )}
      open={open ?? state === 'choose'}
      onOpenChange={setOpen}
      triggerRef={trigger}
    >
      <p className="font-medium">{label}</p>
      <ParticipantChoice
        key={`${data.acceptance.revision}:${data.choice}`}
        data={data}
        mira={mira}
        onDone={() => setOpen(false)}
      />
      {privateList}
      {privateEntry}
      {data.canAccept && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          disabled={mira.acceptance.isPending}
          onClick={() => mira.acceptance.mutate('turn_off')}
        >
          <Power aria-hidden className="size-4" />
          {t('host_turn_off')}
        </Button>
      )}
      <MiraAbout>
        <ReportMinor mira={mira} />
      </MiraAbout>
    </RoomMiraChip>
  );
}

type Mira = ReturnType<typeof useRoomMira>;

/**
 * The caller's own Mira choice on its own, for surfaces such as the live
 * transcript notice that need Mira on before they can offer anything else.
 */
export function RoomMiraSelfChoice({ meetingId }: { meetingId: string }) {
  const mira = useRoomMira(meetingId);
  if (!mira.data?.acceptance) return null;
  return (
    <ParticipantChoice
      key={`${mira.data.acceptance.revision}:${mira.data.choice}`}
      data={mira.data}
      mira={mira}
      onDone={() => undefined}
    />
  );
}

function ParticipantChoice({
  data,
  mira,
  onDone,
}: {
  data: RoomMiraAvailable;
  mira: Mira;
  onDone: () => void;
}) {
  const t = useTranslations('meet.mira_consent');
  const id = useId();
  const [ticked, setTicked] = useState(mira.presetTicked);
  const busy = mira.choose.isPending;
  const pick = (choice: 'on' | 'off', source: 'confirm' | 'toggle') =>
    mira.choose.mutate({ choice, source }, { onSuccess: onDone });
  if (data.pausing)
    return (
      <p
        role="status"
        className="inline-flex items-center gap-1.5 text-muted-foreground"
      >
        <Loader2 aria-hidden className="size-3.5 animate-spin" />
        {t('pausing')}
      </p>
    );
  if (data.choice === 'on')
    return (
      <div className="space-y-2">
        <p role="status">{t('you_on')}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => pick('off', 'toggle')}
        >
          <Pause aria-hidden className="size-4" />
          {t('turn_off_me')}
        </Button>
      </div>
    );
  // No current choice, or off: the same box and notice, and a confirm.
  return (
    <div className="space-y-2">
      <p role="status" className="text-muted-foreground">
        {data.choice === 'off' ? t('you_off') : t('you_choose')}
      </p>
      <MiraConsentBox
        id={`mira-confirm-${id}`}
        checked={ticked}
        onCheckedChange={setTicked}
        disabled={busy}
        mode={mira.noticeMode}
      />
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={() =>
          pick(ticked ? 'on' : 'off', data.choice ? 'toggle' : 'confirm')
        }
      >
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Check aria-hidden className="size-4" />
        )}
        {t('confirm')}
      </Button>
    </div>
  );
}

/** The host's acceptance: Terms and AI use, and the 18+ confirmation. */
function HostAcceptance({ mira }: { mira: Mira }) {
  const t = useTranslations('meet.mira_consent');
  const id = useId();
  const [adults, setAdults] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-pretty text-muted-foreground">{t('host_terms')}</p>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`mira-adults-${id}`}
          checked={adults}
          onCheckedChange={(value) => setAdults(value === true)}
          className="mt-0.5"
        />
        <Label
          htmlFor={`mira-adults-${id}`}
          className="text-pretty font-normal leading-snug"
        >
          {t('host_adults')}
        </Label>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={!adults || mira.acceptance.isPending}
        onClick={() => mira.acceptance.mutate('accept')}
      >
        {mira.acceptance.isPending ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Power aria-hidden className="size-4" />
        )}
        {t('host_confirm')}
      </Button>
    </div>
  );
}

/** Anyone can report a minor; a second press confirms, never a dialog. */
function ReportMinor({ mira }: { mira: Mira }) {
  const t = useTranslations('meet.mira_consent');
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-1">
      {confirming && (
        <p role="status" className="text-muted-foreground text-xs">
          {t('report_minor_hint')}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant={confirming ? 'destructive' : 'ghost'}
        disabled={mira.acceptance.isPending}
        onClick={() =>
          confirming
            ? mira.acceptance.mutate('report', {
                onSettled: () => setConfirming(false),
              })
            : setConfirming(true)
        }
      >
        <TriangleAlert aria-hidden className="size-4" />
        {confirming ? t('report_minor_confirm') : t('report_minor')}
      </Button>
    </div>
  );
}

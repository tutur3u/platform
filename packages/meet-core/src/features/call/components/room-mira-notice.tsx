'use client';

import { Check, Loader2, Lock, Pause, Power } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { useLiveSession } from '../../live-assistant/live-session-store';
import { MiraConsentBox } from '../../live-assistant/mira-consent-box';
import { MEETING_APP } from '../../../runtime';
import { useMeetUxV2 } from '../prejoin/prejoin-context';
import { MiraAbout } from './mira-about';
import { MiraPrivateEntry } from './mira-private-entry';
import { ReportMinor } from './mira-report-minor';
import { RoomMiraChip, type RoomMiraChipState } from './room-mira-chip';
import { RoomMiraPopover } from './room-mira-popover';
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
type RoomMiraNoticeProps = {
  meetingId: string;
  /** The signed-in account, so the control can open its Private Assistant. */
  accountId?: string;
  acceptanceEventId?: string;
  /** People using Mira privately; it hears only their own microphone. */
  privateUsers?: readonly { userId: string; displayName: string }[];
};

export function RoomMiraNotice(props: RoomMiraNoticeProps) {
  const v2 = useMeetUxV2();
  return v2 && MEETING_APP === 'meet' ? (
    <RoomMiraPopover
      meetingId={props.meetingId}
      accountId={props.accountId}
      acceptanceEventId={props.acceptanceEventId}
    />
  ) : (
    <LegacyRoomMiraNotice {...props} />
  );
}

function LegacyRoomMiraNotice({
  meetingId,
  accountId,
  privateUsers = [],
}: RoomMiraNoticeProps) {
  const t = useTranslations('meet.mira_consent');
  const tl = useTranslations('meet.live');
  const mira = useRoomMira(meetingId);
  const data = mira.data;
  // The popover's own open state belongs to one acceptance revision, so a new
  // revision opens it again for a choice the person has not made.
  const revision = data?.acceptance?.revision ?? 0;
  // A choice is asked for when none is made, or when the person's on was
  // given under the other notice; a new question opens the popover again,
  // even after it was closed.
  const asking =
    !!data?.acceptance &&
    !data.pausing &&
    (data.choice === null || (data.choice === 'on' && mira.noticeStale));
  const [openState, setOpenState] = useState<{
    revision: number;
    asking: boolean;
    open: boolean | null;
  }>({ revision, asking, open: null });
  const open =
    openState.revision === revision && openState.asking === asking
      ? openState.open
      : null;
  const restoreFocus = useRef(true);
  const setOpen = (next: boolean) => {
    if (next) restoreFocus.current = true;
    setOpenState({ revision, asking, open: next });
  };
  const session = useLiveSession(meetingId, accountId);
  const trigger = useRef<HTMLButtonElement>(null);
  // The assistant's dialog takes focus, so the popover must not take it back.
  const closeFocus = (event: Event) => {
    if (restoreFocus.current) return;
    event.preventDefault();
    restoreFocus.current = true;
  };
  // Focus goes to the control first, so the dialog's close returns there.
  const privateEntry = session && (
    <MiraPrivateEntry
      session={session}
      onOpen={() => {
        restoreFocus.current = false;
        trigger.current?.focus();
        setOpen(false);
        session.controls.openConsent();
      }}
    />
  );
  // Everyone in the call sees who is using Mira privately, whether or not
  // they have Mira themselves.
  const privateList = privateUsers.length > 0 && (
    <ul className="space-y-1 text-muted-foreground text-xs">
      {privateUsers.map((person) => (
        <li key={person.userId} role="status" className="flex gap-1.5">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {tl('phase_private_indicator', { name: person.displayName })}
        </li>
      ))}
    </ul>
  );
  // A closed control still tells a screen reader that Mira is in private use.
  const privateNote =
    privateUsers.length > 0
      ? tl('private_use_count', { count: privateUsers.length })
      : undefined;
  // Room Mira is off, unavailable or unreadable for this person. The control
  // then holds their Private Assistant and who else uses one, and is absent
  // without either.
  if (!data || (!data.acceptance && !data.canAccept)) {
    if (!session && !privateList) return null;
    return (
      <RoomMiraChip
        state="off"
        title={tl('title')}
        description={privateNote}
        open={open ?? false}
        onOpenChange={setOpen}
        triggerRef={trigger}
        onCloseAutoFocus={closeFocus}
      >
        {privateList}
        {privateEntry}
        <MiraAbout mode={mira.noticeMode} />
      </RoomMiraChip>
    );
  }
  if (!data.acceptance)
    return (
      <RoomMiraChip
        state="host"
        title={t('host_turn_on')}
        description={privateNote}
        open={open ?? false}
        onOpenChange={setOpen}
        triggerRef={trigger}
        onCloseAutoFocus={closeFocus}
      >
        <p className="font-medium">{t('host_title')}</p>
        <HostAcceptance mira={mira} />
        {privateList}
        {privateEntry}
        <MiraAbout mode={mira.noticeMode} />
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
      description={[
        t(
          state === 'pausing'
            ? 'pausing'
            : state === 'on'
              ? 'you_on'
              : state === 'off'
                ? 'you_off'
                : 'you_choose'
        ),
        privateNote,
      ]
        .filter(Boolean)
        .join(' ')}
      open={open ?? asking}
      onOpenChange={setOpen}
      triggerRef={trigger}
      onCloseAutoFocus={closeFocus}
    >
      <p className="font-medium">{label}</p>
      <ParticipantChoice
        key={`${data.acceptance.revision}:${data.choice}:${mira.noticeStale}`}
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
      <MiraAbout mode={mira.noticeMode}>
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
  const v2 = useMeetUxV2();
  return v2 && MEETING_APP === 'meet' ? (
    <RoomMiraTranscriptChoice meetingId={meetingId} />
  ) : (
    <LegacyRoomMiraSelfChoice meetingId={meetingId} />
  );
}

function RoomMiraTranscriptChoice({ meetingId }: { meetingId: string }) {
  const t = useTranslations('meet.mira_consent');
  const mira = useRoomMira(meetingId);
  if (
    !mira.noticeStale ||
    mira.data?.choice !== 'on' ||
    mira.data.accountConfirmation !== 'confirmed'
  )
    return null;
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {t('mode_changed_reason', {
          mode: mira.noticeMode === 'self' ? 'per_speaker' : 'room',
        })}
      </p>
      <Button
        type="button"
        size="sm"
        disabled={mira.choosing || !mira.noticeKnown}
        onClick={() => mira.choose.mutate({ choice: 'on', source: 'confirm' })}
      >
        {t('confirm_transcript_mode')}
      </Button>
    </div>
  );
}

function LegacyRoomMiraSelfChoice({ meetingId }: { meetingId: string }) {
  const mira = useRoomMira(meetingId);
  if (!mira.data?.acceptance) return null;
  return (
    <ParticipantChoice
      key={`${mira.data.acceptance.revision}:${mira.data.choice}:${mira.noticeStale}`}
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
  // Asking again for a new scope starts unticked, so a dismissing click never
  // consents to it.
  const [ticked, setTicked] = useState(
    () => !mira.noticeStale && mira.presetTicked()
  );
  const busy = mira.choosing;
  // Turning Mira on waits for the meeting's notice; an untick never does.
  const waiting = ticked && !mira.noticeKnown;
  const pick = (choice: 'on' | 'off', source: 'confirm' | 'toggle') =>
    mira.choose.mutate({ choice, source }, { onSuccess: onDone });
  // Mira is never shown as on until the room has confirmed it.
  if (data.pausing || mira.turningOn)
    return (
      <p
        role="status"
        className="inline-flex items-center gap-1.5 text-muted-foreground"
      >
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {t(data.pausing ? 'pausing' : 'turning_on')}
      </p>
    );
  // An `on` under the other notice is confirmed again below, by the person.
  if (data.choice === 'on' && !mira.noticeStale)
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
      {/* Why this is asked again; explanatory, so never part of the hash. */}
      {mira.noticeStale && (
        <p className="text-pretty text-muted-foreground text-xs">
          {t('mode_changed_reason', {
            mode: mira.noticeMode === 'self' ? 'per_speaker' : 'room',
          })}
        </p>
      )}
      <MiraConsentBox
        id={`mira-confirm-${id}`}
        checked={ticked}
        onCheckedChange={setTicked}
        disabled={busy}
        mode={mira.noticeMode}
      />
      {/* An on waits until the meeting's notice is known, so the box shows
          and hashes the right text. */}
      <Button
        type="button"
        size="sm"
        disabled={busy || waiting}
        aria-busy={waiting || undefined}
        onClick={() =>
          pick(
            ticked ? 'on' : 'off',
            data.choice && !mira.noticeStale ? 'toggle' : 'confirm'
          )
        }
      >
        {busy || waiting ? (
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

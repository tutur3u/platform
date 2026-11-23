'use client';

import { Check, Loader2, Pause, Power, TriangleAlert } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { MiraConsentBox } from '../../live-assistant/mira-consent-box';
import { RoomMiraChip, type RoomMiraChipState } from './room-mira-chip';
import {
  type RoomMiraAvailable,
  roomMiraConsentKey,
  useRoomMira,
} from './use-room-mira';

export { roomMiraConsentKey };

/**
 * Room Mira for every admitted participant. The header placement is the
 * persistent indicator: while an acceptance is current it always shows who
 * turned Mira on, and it opens on its own until this person confirms. The
 * chat placement summarizes the same state beside the composer, and shows
 * `details` (what the host allows Mira to do) when room Mira is unavailable.
 */
export function RoomMiraNotice({
  meetingId,
  details,
  placement = 'chat',
}: {
  meetingId: string;
  details?: ReactNode;
  placement?: 'chat' | 'header';
}) {
  const t = useTranslations('meet.mira_consent');
  const tc = useTranslations('meet.call');
  const mira = useRoomMira(meetingId);
  const [open, setOpen] = useState<boolean | null>(null);
  const data = mira.data;
  if (!data) {
    if (placement === 'header' || mira.loading || !details) return null;
    return (
      <RoomMiraChip
        state="permissions"
        label={tc('miraEverywhere.permissions.title')}
        detailsLabel={tc('room_mira_details')}
        title={tc('miraEverywhere.permissions.title')}
      >
        {details}
      </RoomMiraChip>
    );
  }
  if (!data.acceptance) {
    // Only an acceptor sees an entry point while Mira is off.
    if (!data.canAccept) return null;
    return (
      <RoomMiraChip
        state="host"
        label={t('host_turn_on')}
        detailsLabel={tc('room_mira_details')}
        title={t('host_title')}
        variant={placement}
      >
        <HostAcceptance mira={mira} />
        {placement === 'chat' && details}
      </RoomMiraChip>
    );
  }
  const state: RoomMiraChipState = data.pausing
    ? 'pausing'
    : data.choice === 'on'
      ? 'on'
      : data.choice === 'off'
        ? 'off'
        : 'choose';
  const needsChoice = state === 'choose';
  const label = t('indicator_on', { name: data.acceptance.acceptorName });
  return (
    <RoomMiraChip
      state={state}
      label={label}
      detailsLabel={tc('room_mira_details')}
      title={label}
      variant={placement}
      open={placement === 'header' ? (open ?? needsChoice) : undefined}
      onOpenChange={placement === 'header' ? setOpen : undefined}
    >
      <ParticipantChoice
        key={`${data.acceptance.revision}:${data.choice}`}
        data={data}
        mira={mira}
        onDone={() => setOpen(false)}
      />
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
      <ReportMinor mira={mira} />
      {placement === 'chat' && details}
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
    <div className="space-y-1 border-t pt-2">
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

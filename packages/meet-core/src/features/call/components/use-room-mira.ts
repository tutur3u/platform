'use client';

import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  acceptRoomMira,
  type RoomMiraConsent,
  readMeetTranscriptConsent,
  readRoomMiraConsent,
  reportRoomMiraMinor,
  setMeetTranscriptChoice,
  setRoomMiraChoice,
  turnOffRoomMira,
} from '@tuturuuu/internal-api';
import {
  MEET_TRANSCRIPT_NOTICE_VERSION,
  MIRA_ROOM_NOTICE_VERSION,
} from '@tuturuuu/realtime/meet';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import {
  hashMiraConsentText,
  MIRA_BOX_RECORDS_TRANSCRIPT,
  useMiraConsentText,
} from '../../live-assistant/mira-consent-box';
import {
  markMiraJoinChoiceApplied,
  peekMiraJoinChoice,
  prefersMiraOff,
  rememberMiraPreference,
} from '../../live-assistant/mira-join-choice';
import { holdSelfCapture } from '../../meeting-ai/self-hold';
import { readSelfRoom } from '../../meeting-ai/self-room';
import { transcriptConsentKey } from '../../meeting-ai/use-transcript-consent';
import { useMeetUxV2 } from '../prejoin/prejoin-context';
import { roomMiraChoiceKey, roomMiraConsentKey } from './room-mira-key';
import { useMiraNoticeMode } from './use-mira-notice-mode';

export { roomMiraConsentKey };

/** How often a caller still outside the room re-reads what Mira is doing. */
const JOIN_SEED_REFRESH_MS = 20_000;

/** The caller's room Mira state, shared by every surface in the call. */
export function useRoomMiraConsent(meetingId: string, enabled = true) {
  return useQuery({
    queryKey: roomMiraConsentKey(meetingId),
    queryFn: () => readRoomMiraConsent(meetingId),
    enabled,
    // A pending opt-out settles within the in-flight request.
    refetchInterval: (current) => {
      const data = current.state.data;
      return data?.available && data.pausing ? 2000 : 10_000;
    },
    retry: false,
  });
}

/**
 * What the join screen shows before admission: the box default, the
 * acceptance revision open now and the caller's own latest choice here.
 * Cached apart from the in-call state so a pre-admission answer never stands
 * in for it after joining. It refreshes while the caller is still outside, so
 * a waiting room learns that Mira was turned on.
 */
export function useRoomMiraJoinSeed(meetingId: string | undefined) {
  const query = useQuery({
    queryKey: [...roomMiraConsentKey(meetingId ?? ''), 'join-default'],
    queryFn: () => readRoomMiraConsent(meetingId!),
    enabled: !!meetingId,
    retry: false,
    // Only while Mira is offered here and the caller is still outside; a
    // meeting without Mira is never polled.
    refetchInterval: (current) => {
      const data = current.state.data;
      return data && !data.available && data.joinDefault !== undefined
        ? JOIN_SEED_REFRESH_MS
        : false;
    },
  });
  const data = query.data;
  const ticked = data?.available ? data.boxTickedByDefault : data?.joinDefault;
  const revision = data?.available
    ? (data.acceptance?.revision ?? 0)
    : (data?.joinRevision ?? 0);
  const lastChoice = data?.available ? data.lastChoice : data?.joinLastChoice;
  return useMemo(
    () =>
      ticked === undefined
        ? undefined
        : { ticked, revision, lastChoice: lastChoice ?? null },
    [ticked, revision, lastChoice]
  );
}

/**
 * True only when a fresh read says the room uses room capture. An unreadable
 * state never records an Allow.
 */
async function roomCaptureMode(meetingId: string) {
  try {
    return (
      readSelfRoom(await readMeetTranscriptConsent(meetingId)).mode === 'room'
    );
  } catch {
    return false;
  }
}

/** Waits between attempts of a failed Mira off: three tries in about 15 s. */
export const MIRA_OFF_RETRY_MS = [5000, 10_000];

export type RoomMiraAvailable = Extract<RoomMiraConsent, { available: true }>;
type Source = 'join' | 'confirm' | 'toggle' | 'auto_on';

/** Join states being recorded now, shared by every surface in the tab. */
const applying = new Set<string>();
/**
 * Join states whose recording failed, with the read they failed under. They
 * retry on the next read, never in a tight loop.
 */
const failedAt = new Map<string, number>();
/** Failed recordings per Join state; it stops retrying after a few. */
const failures = new Map<string, number>();
const MAX_JOIN_FAILURES = 5;
/**
 * The latest Mira choice per meeting in this tab. A retried off stops as soon
 * as a newer choice is made, so it can never undo it.
 */
const latestChoice = new Map<string, number>();

class SupersededMiraChoice extends Error {}

/**
 * Room Mira state and actions for the caller. A box state remembered at Join
 * is recorded once, after admission, only for the acceptance revision that
 * was open on the join screen; any other acceptance asks them to confirm.
 * The Join state is never cleared before it is recorded, and every confirm
 * box starts unticked while the participant's own last state is off.
 */
export function useRoomMira(meetingId: string, accountId?: string) {
  const t = useTranslations('meet.mira_consent');
  const queryClient = useQueryClient();
  const query = useRoomMiraConsent(meetingId);
  const data = query.data?.available ? query.data : undefined;
  // The box and its hash use the same notice: the per-speaker one in a
  // per-speaker meeting, never both. The room's own Mira view names the
  // notice an `on` must be given under; the transcript read stands in for
  // rooms that do not say.
  const transcriptNotice = useMiraNoticeMode(meetingId);
  const notice = data?.noticeMode
    ? { mode: data.noticeMode, known: true }
    : transcriptNotice;
  const legacyText = useMiraConsentText(notice.mode);
  const accountFlow = useMeetUxV2() && data?.accountConfirmation !== undefined;
  const text = accountFlow ? t('account_statement') : legacyText;
  const locale = useLocale();
  const save = (next: RoomMiraConsent) =>
    queryClient.setQueryData(roomMiraConsentKey(meetingId), next);
  const refreshTranscript = () =>
    void queryClient.invalidateQueries({
      queryKey: transcriptConsentKey(meetingId),
    });

  const choose = useMutation({
    mutationKey: roomMiraChoiceKey(meetingId),
    mutationFn: async (input: {
      choice: 'on' | 'off';
      source: Source;
      textHash?: string;
      noticeText?: string;
      locale?: string;
    }) => {
      const ticket = (latestChoice.get(meetingId) ?? 0) + 1;
      latestChoice.set(meetingId, ticket);
      const superseded = () => latestChoice.get(meetingId) !== ticket;
      // A Join state carries the hash of the room-capture notice it showed.
      const mode = input.textHash ? 'room' : notice.mode;
      // Mira is turned on only under a notice known to be this meeting's.
      // Turning it off is never held back.
      if (input.choice === 'on' && !input.textHash && !notice.known)
        throw new Error('The meeting notice is not known yet');
      const payload = {
        choice: input.choice,
        version: MIRA_ROOM_NOTICE_VERSION,
        acceptanceRevision: data?.acceptance?.revision ?? 0,
        source: input.source,
        textHash:
          input.textHash ?? (await hashMiraConsentText(input.noticeText ?? text)),
        ...(accountFlow && accountId ? { expectedActorId: accountId } : {}),
        locale: input.locale ?? locale,
        ...(mode === 'self' ? { noticeMode: 'self' as const } : {}),
      };
      // A Join state already retries on the next read.
      if (input.choice === 'on' || input.source === 'join')
        return setRoomMiraChoice(meetingId, payload);
      // An off is recorded even when the room call fails, and repeating it
      // is harmless, so it is retried a few times. An on never is.
      for (let attempt = 0; ; attempt++) {
        try {
          return await setRoomMiraChoice(meetingId, payload);
        } catch (error) {
          const wait = MIRA_OFF_RETRY_MS[attempt];
          if (wait === undefined) throw error;
          if (superseded()) throw new SupersededMiraChoice();
          await new Promise((resolve) => setTimeout(resolve, wait));
          if (superseded()) throw new SupersededMiraChoice();
        }
      }
    },
    // Off stops this device's own per-speaker capture before the request is
    // sent, and keeps it stopped until the person allows the transcript again.
    onMutate: (input) => {
      if (input.choice === 'off') holdSelfCapture(meetingId);
    },
    onSuccess: async (next, input) => {
      save(next);
      rememberMiraPreference(meetingId, input.choice === 'on');
      // Off declines the transcript in the room itself; on also allows it
      // while the box covers the live transcript. A per-speaker meeting
      // never takes that Allow from the box: each person allows their own
      // voice in the transcript notice.
      if (
        input.choice === 'on' &&
        !accountFlow &&
        MIRA_BOX_RECORDS_TRANSCRIPT &&
        next.available &&
        next.choice === 'on' &&
        (await roomCaptureMode(meetingId))
      )
        await setMeetTranscriptChoice(
          meetingId,
          'allow',
          MEET_TRANSCRIPT_NOTICE_VERSION
        ).catch(() => undefined);
      refreshTranscript();
    },
    // A Join state is retried quietly on the next scheduled read; reading
    // again here would retry it at once, in a loop against a failing room.
    // After the person's own choice fails, the room's real Mira state and
    // the meeting's notice are read again, so a refusal for another notice
    // shows the current one and the person chooses again; nothing is resent
    // under a different notice.
    onError: (error, input) => {
      // A newer choice took over; it reports its own outcome.
      if (error instanceof SupersededMiraChoice) return;
      if (input.source === 'join' || input.source === 'auto_on') return;
      const rollback =
        'code' in error && error.code === 'account_confirmation_required';
      toast.error(t(rollback ? 'host_reaccept_required' : 'save_failed'));
      void queryClient.invalidateQueries({
        queryKey: roomMiraConsentKey(meetingId),
      });
      refreshTranscript();
    },
  });

  const acceptance = useMutation({
    mutationFn: (action: 'accept' | 'turn_off' | 'report') =>
      action === 'accept'
        ? accountFlow
          ? acceptRoomMira(meetingId, ['chat', 'captions', 'notes'], accountId)
          : acceptRoomMira(meetingId, ['chat', 'captions', 'notes'])
        : action === 'turn_off'
          ? turnOffRoomMira(meetingId)
          : reportRoomMiraMinor(meetingId),
    // Turning Mira off for everyone stops this device's capture at once.
    onMutate: (action) => {
      if (action !== 'accept') holdSelfCapture(meetingId);
    },
    onSuccess: (next) => {
      save(next);
      refreshTranscript();
    },
    onError: () => toast.error(t('host_failed')),
  });

  // The Join box state applies once, to an acceptance current at Join.
  const revision = data?.acceptance?.revision;
  const dataUpdatedAt = query.dataUpdatedAt;
  const pendingJoin =
    !!data?.acceptance && data.choice === null
      ? peekMiraJoinChoice(meetingId)
      : null;
  const noticeMode = notice.mode;
  const noticeKnown = notice.known;
  useEffect(() => {
    if (accountFlow || !data?.acceptance || data.choice !== null || !pendingJoin)
      return;
    // The join screen showed the room-capture notice. A ticked box applies
    // only once the meeting's notice is known to be that one; a per-speaker
    // meeting asks the person to confirm under its own notice instead. An
    // untick keeps Mira off whatever the notice, so it always applies.
    if (
      pendingJoin.ticked &&
      (!noticeKnown || (pendingJoin.noticeMode ?? 'room') !== noticeMode)
    )
      return;
    const acceptance = data.acceptance;
    const flight = `${meetingId}:${acceptance.revision}`;
    // Only the acceptance that was open on the join screen takes the Join
    // state; any other revision, or one that cannot be compared, asks the
    // participant to confirm. Revisions come from the server, so client clock
    // skew never decides it.
    if (
      pendingJoin.appliedRevision === acceptance.revision ||
      pendingJoin.seenRevision !== acceptance.revision ||
      !/^[0-9a-f]{64}$/.test(pendingJoin.textHash) ||
      applying.has(flight) ||
      failedAt.get(flight) === dataUpdatedAt ||
      (failures.get(flight) ?? 0) >= MAX_JOIN_FAILURES
    )
      return;
    // A workspace that unticks the box by default never counts a box that
    // started ticked on a join screen, and neither does a box that started
    // ticked for someone whose own last choice here was off (a new device or
    // cleared storage); the participant confirms instead.
    if (
      pendingJoin.ticked &&
      (!data.boxTickedByDefault || data.lastChoice === 'off')
    )
      return;
    applying.add(flight);
    // Settled through the promise, not per-call callbacks: those are dropped
    // when the component unmounts mid-flight, which would leave this Join
    // state marked as in flight for the rest of the tab.
    void choose
      .mutateAsync({
        choice: pendingJoin.ticked ? 'on' : 'off',
        source: 'join',
        textHash: pendingJoin.textHash,
        locale: pendingJoin.locale,
      })
      .then(
        () => {
          failedAt.delete(flight);
          failures.delete(flight);
          markMiraJoinChoiceApplied(meetingId, acceptance.revision);
        },
        () => {
          failedAt.set(flight, dataUpdatedAt);
          failures.set(flight, (failures.get(flight) ?? 0) + 1);
        }
      )
      .finally(() => applying.delete(flight));
  }, [
    data,
    pendingJoin,
    meetingId,
    choose,
    revision,
    dataUpdatedAt,
    noticeKnown,
    noticeMode,
    accountFlow,
  ]);

  // An untick is recorded even when no acceptance is open: an explicit off
  // (revision 0) that also declines the live transcript, so the evidence
  // matches what the participant did. A tick records nothing without an
  // acceptance; the host's later acceptance asks for a confirm.
  const untick =
    data &&
    !data.acceptance &&
    data.choice === null &&
    data.lastChoice !== 'off'
      ? peekMiraJoinChoice(meetingId)
      : null;
  useEffect(() => {
    if (accountFlow || !data || data.acceptance || data.choice !== null) return;
    if (data.lastChoice === 'off' || !untick || untick.ticked) return;
    const flight = `${meetingId}:none`;
    if (
      untick.appliedRevision === 0 ||
      applying.has(flight) ||
      failedAt.get(flight) === dataUpdatedAt
    )
      return;
    applying.add(flight);
    // Without a usable hash the notice is hashed again as it is shown now.
    const evidence = /^[0-9a-f]{64}$/.test(untick.textHash)
      ? { textHash: untick.textHash, locale: untick.locale }
      : {};
    void choose
      .mutateAsync({ choice: 'off', source: 'join', ...evidence })
      .then(
        () => {
          failedAt.delete(flight);
          markMiraJoinChoiceApplied(meetingId, 0);
        },
        () => failedAt.set(flight, dataUpdatedAt)
      )
      .finally(() => applying.delete(flight));
  }, [accountFlow, data, untick, meetingId, choose, dataUpdatedAt]);

  return {
    dataUpdatedAt,
    /** The notice the box must show; the choice is hashed over it. */
    noticeMode,
    /** False until the meeting's notice is known; nothing turns Mira on. */
    noticeKnown,
    /**
     * The person's `on` was given under the other notice: the box asks them
     * to confirm under the current one. Nothing confirms on their behalf.
     */
    noticeStale: !!data?.noticeStale,
    /** A Mira choice is in flight from any surface in this tab. */
    choosing: useIsMutating({ mutationKey: roomMiraChoiceKey(meetingId) }) > 0,
    /**
     * An `on` is in flight or staged in the room and not yet in effect. The
     * request in flight decides; a staged `on` the room dropped (for example
     * on a restart) reads as not pending once nothing is in flight.
     */
    turningOn:
      (choose.isPending && choose.variables?.choice === 'on') ||
      (!choose.isPending && !!data?.pending),
    loading: query.isLoading,
    available: query.data?.available === true,
    data,
    /**
     * Preset for a confirm box: unticked while the participant's own last
     * state is off, else the workspace default.
     */
    presetTicked: () =>
      data?.choice !== 'off' &&
      data?.lastChoice !== 'off' &&
      !prefersMiraOff(meetingId) &&
      (data?.boxTickedByDefault ?? true),
    choose,
    acceptance,
  };
}

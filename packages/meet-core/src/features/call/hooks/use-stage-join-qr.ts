'use client';

import { useState, useSyncExternalStore } from 'react';
import type { CallState } from '../lib/call-state';
import { useMeetCallUx } from '../prejoin/use-meet-call-ux';
import { useJoinQrShown } from './use-join-qr-shown';

const noSubscribe = () => () => undefined;
const readOrigin = () => window.location.origin;
const noOrigin = () => null;

/**
 * Whether the join QR may use its card from `lg` up. Anything that fills
 * the stage edge to edge (an open activity, a screen share or a spotlight,
 * or the presence roster) keeps it to the chip, so it never covers a face, a
 * shared screen or activity controls.
 */
export function joinQrUsesCard({
  activityOpen,
  presenceOnly,
  stageFilled,
}: {
  activityOpen: boolean;
  presenceOnly: boolean;
  stageFilled: boolean;
}) {
  return !activityOpen && !presenceOnly && !stageFilled;
}

/** True once the room announces that it keeps the join QR settings. */
export function roomKeepsJoinQr(state: Pick<CallState, 'settingsFeatures'>) {
  return state.settingsFeatures?.includes('joinQr') ?? false;
}

/** Hosts and co-hosts: the same permission as Activities settings. */
export function managesJoinQr(
  state: Pick<CallState, 'canManageParticipants' | 'role'>
) {
  return state.canManageParticipants ?? state.role === 'host';
}

/**
 * Whether the card offers its room options (auto-hide, hide for everyone):
 * only to hosts and co-hosts, and only in a room that keeps the settings,
 * so the options never silently do nothing on an older realtime Worker.
 */
export function offersJoinQrOptions(
  state: Pick<
    CallState,
    'settingsFeatures' | 'canManageParticipants' | 'role'
  >
) {
  return managesJoinQr(state) && roomKeepsJoinQr(state);
}

/**
 * The stage join QR for one call: whether it shows (MEET_UX_V2 only, on by
 * default), whether it is a card or a chip, and whether the stage keeps its
 * bottom-left corner free for the card.
 */
export function useStageJoinQr(state: CallState, activityOpen: boolean) {
  const enabled = useMeetCallUx();
  const shown = useJoinQrShown(state.settings, state.settingsClockSkew);
  const origin = useSyncExternalStore(noSubscribe, readOrigin, noOrigin);
  const [minimized, setMinimized] = useState(false);
  const [stageFilled, setStageFilled] = useState(false);
  const visible = enabled && shown && origin !== null;
  const card =
    visible &&
    joinQrUsesCard({
      activityOpen,
      presenceOnly: state.settings.transport === 'presence',
      stageFilled,
    });
  return {
    visible,
    origin,
    card,
    /** The stage keeps a left gutter free from `lg` up for the open card. */
    reserveCorner: card && !minimized,
    minimized,
    setMinimized,
    setStageFilled,
  };
}

export type StageJoinQrState = ReturnType<typeof useStageJoinQr>;

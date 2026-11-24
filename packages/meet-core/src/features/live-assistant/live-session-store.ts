'use client';
import type { MeetLiveVoice } from '@tuturuuu/internal-api';
import { useSyncExternalStore } from 'react';
import type { LiveAssistantEvent, LiveClientCommand } from './contracts';

type Review = Extract<LiveAssistantEvent, { type: 'review' }>;
type Turn = { role: string; text: string };

/** Everything the Private Assistant tab needs to drive the personal Live session. */
export type LiveSessionSnapshot = {
  meetingId: string;
  accountId: string;
  status: string;
  mode: string | undefined;
  transcript: readonly Turn[];
  reviews: readonly Review[];
  error: string | null | undefined;
  /** A server-confirmed Continue is on record for this meeting and account. */
  accepted: boolean;
  /** Shared audio owns the microphone, so personal capture cannot start. */
  audioSuppressed: boolean;
  meetingMicOn: boolean;
  controls: LiveSessionControls;
};

export type LiveSessionControls = {
  /** Starts personal capture. It mutes the meeting microphone first. */
  start: () => Promise<void>;
  send: (message: LiveClientCommand) => void;
  stop: () => Promise<void>;
  decide: (review: Review, approved: boolean, text?: string) => Promise<void>;
  /** Opens the consent choice for people who have not continued yet. */
  openConsent: () => void;
};

const DEFAULT_VOICE: MeetLiveVoice = 'Aoede';

let snapshot: LiveSessionSnapshot | null = null;
let voice: MeetLiveVoice = DEFAULT_VOICE;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishLiveSession(next: LiveSessionSnapshot) {
  snapshot = next;
  emit();
}

/** Clears the session only for the panel that published it, never for a newer one. */
export function clearLiveSession(controls: LiveSessionControls) {
  if (snapshot?.controls !== controls) return;
  snapshot = null;
  emit();
}

export function readLiveVoice() {
  return voice;
}

export function setLiveVoice(next: MeetLiveVoice) {
  if (voice === next) return;
  voice = next;
  emit();
}

/** The published session, only while it belongs to this meeting and account. */
export function useLiveSession(meetingId: string, accountId?: string) {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null
  );
  return current?.meetingId === meetingId && current.accountId === accountId
    ? current
    : null;
}

export function useLiveVoice() {
  return useSyncExternalStore(
    subscribe,
    () => voice,
    () => DEFAULT_VOICE
  );
}

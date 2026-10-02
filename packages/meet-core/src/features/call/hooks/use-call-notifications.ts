'use client';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { usePlaybackVolume } from '../components/playback-volume';
import { type CallNotice, collectCallNotices } from '../lib/call-notifications';
import type { CallState } from '../lib/call-state';

export function useCallNotifications(
  state: CallState,
  enabled: boolean,
  connected: boolean,
  openPanel: (panel: 'chat' | 'participants') => void,
  activePanel: 'chat' | 'participants' | null,
  audioSuppressed = false
) {
  const volume = usePlaybackVolume();
  const t = useTranslations('meet.call');
  const pending = useRef(new Map<string, CallNotice>());
  const [visibilityRevision, setVisibilityRevision] = useState(0);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState !== 'hidden')
        setVisibilityRevision((value) => value + 1);
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, []);
  const previous = useRef(state);
  const wasConnected = useRef(false);
  const [sound, setSound] = useState(true);
  const audio = useRef<AudioContext | null>(null);
  const lastSound = useRef(0);
  const waitingSeen = useRef(new Set<string>());
  const chatToasts = useRef(new Set<string>());
  useEffect(() => {
    if (activePanel !== 'chat') return;
    for (const id of chatToasts.current) toast.dismiss(id);
    chatToasts.current.clear();
  }, [activePanel]);
  useEffect(() => {
    const unlock = () => {
      try {
        const AudioCtor =
          window.AudioContext ??
          (
            window as Window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AudioCtor) return;
        audio.current ??= new AudioCtor();
        void audio.current.resume().catch(() => undefined);
      } catch {
        /* Visual notifications remain available without Web Audio. */
      }
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      void audio.current?.close().catch(() => undefined);
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    // Visibility changes flush queued notices even without a room update.
    void visibilityRevision;
    const notices =
      enabled && connected && wasConnected.current
        ? collectCallNotices(previous.current, state).filter(
            (notice) => notice.kind !== 'waiting'
          )
        : [];
    if (
      enabled &&
      connected &&
      state.admission === 'admitted' &&
      !state.ended &&
      state.role === 'host'
    ) {
      for (const person of state.waiting) {
        if (!waitingSeen.current.has(person.userId))
          notices.push({
            id: `waiting:${person.userId}`,
            kind: 'waiting',
            name: person.displayName,
          });
      }
      waitingSeen.current = new Set(
        state.waiting.map((person) => person.userId)
      );
    }
    previous.current = state;
    wasConnected.current = connected;
    if (!enabled || !connected || state.ended || state.admission !== 'admitted')
      pending.current.clear();
    for (const notice of notices) {
      pending.current.set(notice.id, notice);
      // Bound background accumulation without retaining entire room history.
      if (pending.current.size > 50)
        pending.current.delete(pending.current.keys().next().value!);
    }
    if (document.visibilityState === 'hidden') return;
    const visibleNotices = [...pending.current.values()].filter(
      (notice) =>
        (notice.kind !== 'chat' || activePanel !== 'chat') &&
        (notice.kind !== 'waiting' ||
          (state.role === 'host' &&
            state.waiting.some(
              (person) => notice.id === `waiting:${person.userId}`
            )))
    );
    pending.current.clear();
    for (const notice of visibleNotices) {
      if (notice.kind === 'chat') chatToasts.current.add(notice.id);
      const panel = notice.kind === 'chat' ? 'chat' : 'participants';
      toast.info(t(`notice_${notice.kind}`, { name: notice.name }), {
        id: notice.kind === 'chat' ? notice.id : undefined,
        onDismiss: () => chatToasts.current.delete(notice.id),
        onAutoClose: () => chatToasts.current.delete(notice.id),
        description: notice.body?.slice(0, 140),
        duration: notice.kind === 'waiting' ? 10000 : 5000,
        action: {
          label: t(notice.kind === 'waiting' ? 'review_requests' : 'view'),
          onClick: () => openPanel(panel),
        },
      });
    }
    const context = audio.current;
    if (
      !visibleNotices.length ||
      !sound ||
      volume === 0 ||
      audioSuppressed ||
      context?.state !== 'running' ||
      Date.now() - lastSound.current < 1200
    )
      return;
    lastSound.current = Date.now();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    const start = context.currentTime;
    oscillator.frequency.setValueAtTime(
      visibleNotices.some((notice) => notice.kind === 'waiting') ? 660 : 520,
      start
    );
    oscillator.frequency.setValueAtTime(780, start + 0.09);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.06 * volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001 * volume, start + 0.25);
    oscillator.start(start);
    oscillator.stop(start + 0.26);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }, [
    state,
    visibilityRevision,
    enabled,
    connected,
    sound,
    volume,
    audioSuppressed,
    openPanel,
    activePanel,
    t,
  ]);
  return { sound, toggleSound: () => setSound((value) => !value) };
}

'use client';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { collectCallNotices } from '../lib/call-notifications';
import type { CallState } from '../lib/call-state';

export function useCallNotifications(
  state: CallState,
  enabled: boolean,
  connected: boolean,
  openPanel: (panel: 'chat' | 'participants') => void
) {
  const t = useTranslations('meet.call');
  const previous = useRef(state);
  const wasConnected = useRef(false);
  const [sound, setSound] = useState(true);
  const audio = useRef<AudioContext | null>(null);
  const lastSound = useRef(0);
  useEffect(() => {
    const unlock = () => {
      try {
        audio.current ??= new AudioContext();
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
    const notices =
      enabled && connected && wasConnected.current
        ? collectCallNotices(previous.current, state)
        : [];
    previous.current = state;
    wasConnected.current = connected;
    for (const notice of notices.slice(-3)) {
      const panel = notice.kind === 'chat' ? 'chat' : 'participants';
      toast.info(t(`notice_${notice.kind}`, { name: notice.name }), {
        id: `meet-${notice.id}`,
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
      !notices.length ||
      !sound ||
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
      notices.some((notice) => notice.kind === 'waiting') ? 660 : 520,
      start
    );
    oscillator.frequency.setValueAtTime(780, start + 0.09);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.06, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    oscillator.start(start);
    oscillator.stop(start + 0.26);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }, [state, enabled, connected, sound, openPanel, t]);
  return { sound, toggleSound: () => setSound((value) => !value) };
}

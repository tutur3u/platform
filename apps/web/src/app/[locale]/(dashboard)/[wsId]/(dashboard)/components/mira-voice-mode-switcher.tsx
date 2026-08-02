'use client';

import { cn } from '@tuturuuu/utils/format';
import dynamic from 'next/dynamic';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

const AssistantVoiceClient = dynamic(
  () => import('../assistant/assistant-client'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-0 flex-1 animate-pulse rounded-lg bg-foreground/5" />
    ),
  }
);

export function MiraVoiceModeSwitcher({
  children,
  inputRef,
  wsId,
}: {
  children: (onVoiceToggle: () => void) => ReactNode;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  wsId: string;
}) {
  const [voiceActive, setVoiceActive] = useState(false);
  const voiceActiveRef = useRef(false);
  const focusFrameRef = useRef<number | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);

  const cancelPendingFocus = useCallback(() => {
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }
    if (focusTimeoutRef.current !== null) {
      window.clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = null;
    }
  }, []);

  const exitVoice = useCallback(() => {
    cancelPendingFocus();
    voiceActiveRef.current = false;
    setVoiceActive(false);
    const focusInput = () => {
      if (voiceActiveRef.current) return;
      inputRef.current?.focus({ preventScroll: true });
    };
    focusFrameRef.current = window.requestAnimationFrame(focusInput);
    focusTimeoutRef.current = window.setTimeout(focusInput, 180);
  }, [cancelPendingFocus, inputRef]);

  const enterVoice = useCallback(() => {
    cancelPendingFocus();
    voiceActiveRef.current = true;
    setVoiceActive(true);
  }, [cancelPendingFocus]);

  useEffect(() => cancelPendingFocus, [cancelPendingFocus]);

  useEffect(() => {
    if (!voiceActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      exitVoice();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exitVoice, voiceActive]);

  return (
    <>
      <div
        aria-hidden={voiceActive || undefined}
        className={cn('contents', voiceActive && 'hidden')}
      >
        {children(enterVoice)}
      </div>
      {voiceActive && <AssistantVoiceClient onExit={exitVoice} wsId={wsId} />}
    </>
  );
}

'use client';

import dynamic from 'next/dynamic';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useState } from 'react';

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

  const exitVoice = useCallback(() => {
    setVoiceActive(false);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
  }, [inputRef]);

  useEffect(() => {
    if (!voiceActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      exitVoice();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exitVoice, voiceActive]);

  if (voiceActive) {
    return <AssistantVoiceClient onExit={exitVoice} wsId={wsId} />;
  }

  return children(() => setVoiceActive(true));
}

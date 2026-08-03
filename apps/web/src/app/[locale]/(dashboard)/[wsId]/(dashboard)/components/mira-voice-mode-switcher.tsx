'use client';

import { AudioLines, MessageSquareText } from '@tuturuuu/icons';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { cn } from '@tuturuuu/utils/format';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

const AssistantVoiceClient = dynamic(
  () => import('../assistant/assistant-client'),
  {
    ssr: false,
    loading: () => <div className="min-h-0 flex-1" />,
  }
);

export function MiraVoiceModeSwitcher({
  creditSource,
  creditWsId,
  children,
  header,
  inputRef,
  wsId,
}: {
  children: (onVoiceToggle: () => void) => ReactNode;
  creditSource: 'personal' | 'workspace';
  creditWsId?: string;
  header: (modeControl: ReactNode) => ReactNode;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  wsId: string;
}) {
  const t = useTranslations('dashboard.voice_assistant');
  const [mode, setMode] = useState<'chat' | 'live'>('chat');
  const voiceActive = mode === 'live';
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
    setMode('chat');
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
    setMode('live');
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

  const modeControl = (
    <ToggleGroup
      aria-label={t('mode_label')}
      className="h-8 shrink-0 border bg-background/75 p-0.5 shadow-sm backdrop-blur-md"
      onValueChange={(value) => {
        if (value === 'chat') exitVoice();
        if (value === 'live') enterVoice();
      }}
      type="single"
      value={mode}
      variant="outline"
    >
      <ToggleGroupItem
        aria-label={t('chat_mode')}
        className="h-7 gap-1.5 border-0 px-2.5 text-xs data-[state=on]:bg-foreground data-[state=on]:text-background"
        value="chat"
      >
        <MessageSquareText className="size-3.5" />
        <span>{t('chat_mode')}</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        aria-label={t('live_mode')}
        className="h-7 gap-1.5 border-0 px-2.5 text-xs data-[state=on]:bg-foreground data-[state=on]:text-background"
        value="live"
      >
        <AudioLines className="size-3.5" />
        <span>{t('live_mode')}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {header(modeControl)}
      <div
        aria-hidden={voiceActive || undefined}
        className={cn(
          'min-h-0 min-w-0 flex-1 flex-col',
          voiceActive ? 'hidden' : 'flex'
        )}
      >
        {children(enterVoice)}
      </div>
      {voiceActive && (
        <AssistantVoiceClient
          creditSource={creditSource}
          creditWsId={creditWsId}
          wsId={wsId}
        />
      )}
    </div>
  );
}

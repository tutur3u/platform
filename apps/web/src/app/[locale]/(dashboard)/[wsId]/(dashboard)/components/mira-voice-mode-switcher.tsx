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
    loading: () => <VoiceClientModuleLoading />,
  }
);

function VoiceClientModuleLoading() {
  const t = useTranslations('dashboard.voice_assistant');
  return (
    <div
      aria-live="polite"
      className="flex min-h-0 flex-1 items-center justify-center"
    >
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/45 px-4 py-2 text-muted-foreground text-sm backdrop-blur-sm">
        <AudioLines className="size-4 animate-pulse text-primary" />
        <span>{t('preparing_live')}</span>
      </div>
    </div>
  );
}

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
      className="h-8 shrink-0 gap-0.5 rounded-lg border border-border/60 bg-muted/45 p-0.5 backdrop-blur-md"
      onValueChange={(value) => {
        if (value === 'chat') exitVoice();
        if (value === 'live') enterVoice();
      }}
      type="single"
      value={mode}
    >
      <ToggleGroupItem
        aria-label={t('chat_mode')}
        className="h-7 gap-1.5 rounded-[6px] px-2.5 text-muted-foreground text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
        value="chat"
      >
        <MessageSquareText className="size-3.5" />
        <span>{t('chat_mode')}</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        aria-label={t('live_mode')}
        className="h-7 gap-1.5 rounded-[6px] px-2.5 text-muted-foreground text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
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
          onReturnToChat={exitVoice}
          wsId={wsId}
        />
      )}
    </div>
  );
}

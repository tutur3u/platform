'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { AudioLines, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveConversationChange } from '../assistant/use-live-conversation';

export type LiveComposer = {
  connected: boolean;
  sendText: (text: string) => void;
};

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
  history,
  onConversationChange,
  onBeforeVoiceStart,
  creditWsId,
  children,
  header,
  inputRef,
  wsId,
}: {
  onBeforeVoiceStart?: () => void | Promise<void>;
  history?: UIMessage[];
  onConversationChange?: LiveConversationChange;
  composerRef?: RefObject<HTMLDivElement | null>;
  children: (
    onVoiceToggle: () => void,
    voiceActive: boolean,
    live: { content: ReactNode; composer: LiveComposer | null }
  ) => ReactNode;
  creditSource: 'personal' | 'workspace';
  creditWsId?: string;
  header: (modeControl: ReactNode) => ReactNode;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  wsId: string;
}) {
  const t = useTranslations('dashboard.voice_assistant');
  const [mode, setMode] = useState<'chat' | 'live'>('chat');
  const voiceActive = mode === 'live';
  const [liveComposer, setLiveComposer] = useState<LiveComposer | null>(null);
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
    setLiveComposer(null);
    const focusInput = () => {
      if (voiceActiveRef.current) return;
      inputRef.current?.focus({ preventScroll: true });
    };
    focusFrameRef.current = window.requestAnimationFrame(focusInput);
    focusTimeoutRef.current = window.setTimeout(focusInput, 180);
  }, [cancelPendingFocus, inputRef]);

  const enterVoice = useCallback(async () => {
    cancelPendingFocus();
    if (onBeforeVoiceStart) await onBeforeVoiceStart();
    voiceActiveRef.current = true;
    setMode('live');
  }, [cancelPendingFocus, onBeforeVoiceStart]);

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

  const liveContent = voiceActive ? (
    <section
      aria-label={t('live_mode')}
      className="@container flex max-h-[45%] min-h-28 min-w-0 shrink-0 flex-col overflow-hidden border-b"
    >
      <div className="flex shrink-0 items-center justify-between px-3 py-1">
        <span className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
          <AudioLines className="size-3.5 text-dynamic-cyan" />
          {t('live_mode')}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={exitVoice}
              aria-label={t('return_to_chat')}
              className="size-7"
            >
              <X className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('return_to_chat')} (Esc)</TooltipContent>
        </Tooltip>
      </div>
      <AssistantVoiceClient
        history={history}
        onConversationChange={onConversationChange}
        creditSource={creditSource}
        creditWsId={creditWsId}
        onReturnToChat={exitVoice}
        onComposerChange={setLiveComposer}
        wsId={wsId}
      />
    </section>
  ) : null;
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0">{header(null)}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {children(voiceActive ? exitVoice : enterVoice, voiceActive, {
          content: liveContent,
          composer: liveComposer,
        })}
      </div>
    </div>
  );
}

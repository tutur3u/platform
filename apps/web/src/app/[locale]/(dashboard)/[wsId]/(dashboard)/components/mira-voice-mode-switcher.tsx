'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { AudioLines } from '@tuturuuu/icons';
import { toast } from '@tuturuuu/ui/sonner';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveConversationChange } from '../assistant/use-live-conversation';

export type LiveComposer = {
  connected: boolean;
  connecting?: boolean;
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
  historyReady = true,
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
  historyReady?: boolean;
  onConversationChange?: LiveConversationChange;
  composerRef?: RefObject<HTMLDivElement | null>;
  children: (
    onVoiceToggle: () => void,
    voiceActive: boolean,
    live: {
      content: ReactNode;
      results: ReactNode;
      composer: LiveComposer | null;
      inputOpen: boolean;
      toggleInput: () => void;
    }
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
  const [inputOpen, setInputOpen] = useState(false);
  const [results, setResults] = useState<ReactNode>(null);
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
    if (!historyReady) {
      toast.info(t('history_not_ready'));
      return;
    }
    cancelPendingFocus();
    if (onBeforeVoiceStart) await onBeforeVoiceStart();
    voiceActiveRef.current = true;
    setInputOpen(false);
    setMode('live');
  }, [cancelPendingFocus, onBeforeVoiceStart, historyReady, t]);

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
    <AssistantVoiceClient
      onResultsChange={setResults}
      onBeforeStart={onBeforeVoiceStart}
      inputOpen={inputOpen}
      onToggleInput={() => setInputOpen((open) => !open)}
      history={history}
      onConversationChange={onConversationChange}
      creditSource={creditSource}
      creditWsId={creditWsId}
      onReturnToChat={exitVoice}
      onComposerChange={setLiveComposer}
      wsId={wsId}
    />
  ) : null;
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0">{header(null)}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {children(voiceActive ? exitVoice : enterVoice, voiceActive, {
          content: liveContent,
          results: voiceActive ? results : null,
          composer: liveComposer,
          inputOpen,
          toggleInput: () => setInputOpen((open) => !open),
        })}
      </div>
    </div>
  );
}

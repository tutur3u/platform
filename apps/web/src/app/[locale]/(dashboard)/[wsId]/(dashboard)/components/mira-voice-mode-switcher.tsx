'use client';

import { AudioLines, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ReactNode, RefObject } from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

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
  composerRef,
  creditSource,
  creditWsId,
  children,
  header,
  inputRef,
  wsId,
}: {
  composerRef?: RefObject<HTMLDivElement | null>;
  children: (onVoiceToggle: () => void, voiceActive: boolean) => ReactNode;
  creditSource: 'personal' | 'workspace';
  creditWsId?: string;
  header: (modeControl: ReactNode) => ReactNode;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  wsId: string;
}) {
  const t = useTranslations('dashboard.voice_assistant');
  const [mode, setMode] = useState<'chat' | 'live'>('chat');
  const voiceActive = mode === 'live';
  const headerRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });

  useLayoutEffect(() => {
    if (!voiceActive) return;
    const measure = () =>
      setInsets({
        top: (headerRef.current?.getBoundingClientRect().height ?? 0) + 8,
        bottom: (composerRef?.current?.getBoundingClientRect().height ?? 0) + 8,
      });
    measure();
    const observer = new ResizeObserver(measure);
    if (headerRef.current) observer.observe(headerRef.current);
    if (composerRef?.current) observer.observe(composerRef.current);
    return () => observer.disconnect();
  }, [composerRef, voiceActive]);
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

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={headerRef} className="shrink-0">
        {header(null)}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {children(voiceActive ? exitVoice : enterVoice, voiceActive)}
      </div>
      {voiceActive && (
        <section
          aria-label={t('live_mode')}
          style={insets}
          className="absolute inset-x-2 z-20 flex flex-col overflow-hidden rounded-xl border bg-background shadow-lg sm:left-auto sm:w-[min(28rem,90%)]"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="flex items-center gap-2 font-medium text-sm">
              <AudioLines className="size-4 text-primary" />
              {t('live_mode')}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={exitVoice}
                  aria-label={t('return_to_chat')}
                >
                  <X className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('return_to_chat')} (Esc)</TooltipContent>
            </Tooltip>
          </div>
          <AssistantVoiceClient
            creditSource={creditSource}
            creditWsId={creditWsId}
            onReturnToChat={exitVoice}
            wsId={wsId}
          />
        </section>
      )}
    </div>
  );
}

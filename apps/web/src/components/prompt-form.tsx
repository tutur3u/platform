import {
  LiveConnectionState,
  LiveTranscriptionEvent,
  LiveTranscriptionEvents,
  useDeepgram,
} from '@/hooks/useDeepgram';
import {
  MicrophoneEvents,
  MicrophoneState,
  useMicrophone,
} from '@/hooks/useMicrophone';
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';
import { AIChat } from '@/types/db';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { IconArrowElbow } from '@repo/ui/components/ui/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { cn } from '@repo/ui/lib/utils';
import { UseChatHelpers } from 'ai/react';
import { Mic, MicOff, Paperclip, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import Textarea from 'react-textarea-autosize';

export interface PromptProps
  extends Pick<UseChatHelpers, 'input' | 'setInput'> {
  chat: Partial<AIChat> | undefined;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  onSubmit: (value: string) => Promise<void>;
  isLoading: boolean;
}

export function PromptForm({
  onSubmit,
  chat,
  input,
  inputRef,
  setInput,
  isLoading,
}: PromptProps) {
  const t = useTranslations();

  const router = useRouter();
  const { formRef, onKeyDown } = useEnterSubmit();

  const [isInternalLoading, setIsInternalLoading] = useState(isLoading);

  useEffect(() => {
    setIsInternalLoading(isLoading);
  }, [isLoading]);

  const [caption, setCaption] = useState<string | undefined>();
  const {
    connection,
    connectToDeepgram,
    disconnectFromDeepgram,
    connectionState,
  } = useDeepgram();
  const {
    setupMicrophone,
    microphone,
    startMicrophone,
    stopMicrophone,
    microphoneState,
  } = useMicrophone();

  const captionTimeout = useRef<any>();
  const keepAliveInterval = useRef<any>();

  const [showPermissionDenied, setShowPermissionDenied] = useState(false);

  useEffect(() => {
    if (microphoneState === MicrophoneState.NotSetup) {
      setupMicrophone();
    }

    if (microphoneState === MicrophoneState.Error) {
      setShowPermissionDenied(true);
    }

    if (
      microphoneState === MicrophoneState.Paused &&
      connectionState === LiveConnectionState.OPEN
    ) {
      disconnectFromDeepgram();
    }
  }, [microphoneState]);

  useEffect(() => {
    if (!microphone) {
      console.log('!microphone');
      return;
    }

    if (!connection) {
      console.log('!connection');
      return;
    }

    console.log('connectionState', connectionState);

    const onData = (e: BlobEvent) => {
      connection?.send(e.data);
    };

    const onTranscript = (data: LiveTranscriptionEvent) => {
      const { is_final: isFinal, speech_final: speechFinal } = data;
      let thisCaption = data.channel.alternatives?.[0]?.transcript;

      console.log('thisCaption', thisCaption);
      if (thisCaption !== '') {
        console.log('thisCaption !== ""', thisCaption);
        setCaption(thisCaption);
      }

      if (isFinal && speechFinal) {
        clearTimeout(captionTimeout.current);
        captionTimeout.current = setTimeout(() => {
          setInput((prev) => [prev, thisCaption].join(' '));
          setCaption(undefined);
          disconnectFromDeepgram();
          stopMicrophone();
          clearTimeout(captionTimeout.current);
        }, 3000);
      }
    };

    if (connectionState === LiveConnectionState.OPEN) {
      connection?.addListener(LiveTranscriptionEvents.Transcript, onTranscript);
      microphone?.addEventListener(MicrophoneEvents.DataAvailable, onData);
      startMicrophone();
    }

    return () => {
      // prettier-ignore
      connection?.removeListener(LiveTranscriptionEvents.Transcript, onTranscript);
      microphone?.removeEventListener(MicrophoneEvents.DataAvailable, onData);
      clearTimeout(captionTimeout.current);
      stopMicrophone();
    };
  }, [microphone, connection, connectionState]);

  useEffect(() => {
    if (!connection) return;

    if (
      microphoneState !== MicrophoneState.Open &&
      connectionState === LiveConnectionState.OPEN
    ) {
      connection.keepAlive();

      keepAliveInterval.current = setInterval(() => {
        connection.keepAlive();
      }, 10000);
    } else {
      clearInterval(keepAliveInterval.current);
    }

    return () => {
      clearInterval(keepAliveInterval.current);
    };
  }, [microphoneState, connectionState]);

  return (
    <Dialog open={showPermissionDenied} onOpenChange={setShowPermissionDenied}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!input?.trim()) return;
          setInput('');
          await onSubmit(input);
        }}
        ref={formRef}
        className="w-full"
      >
        <div className="bg-background/70 flex max-h-60 w-full items-end overflow-hidden rounded-lg border p-2 pl-4">
          <Textarea
            ref={inputRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            rows={1}
            value={[input, caption || ''].filter(Boolean).join(' ')}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`${t('ai_chat.send_message')}.`}
            spellCheck={false}
            maxRows={7}
            className="placeholder-foreground/50 scrollbar-none w-full resize-none bg-transparent py-2 focus-within:outline-none sm:text-sm"
          />
          <div className="flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled
                  // disabled={isInternalLoading}
                  size="icon"
                  variant="ghost"
                  className={cn('transition duration-300')}
                >
                  <Paperclip />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.add_attachments')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'transition duration-300',
                    (!chat?.id || !isInternalLoading) && input
                      ? 'mx-1'
                      : 'ml-1',
                    chat?.id && isInternalLoading ? 'md:mr-0' : ''
                  )}
                  type="button"
                  onClick={() => {
                    if (microphoneState === MicrophoneState.Error) {
                      setShowPermissionDenied(true);
                      return;
                    }

                    if (
                      microphoneState === MicrophoneState.Ready ||
                      microphoneState === MicrophoneState.Paused
                    ) {
                      connectToDeepgram({
                        model: 'nova-2',
                        interim_results: true,
                        smart_format: true,
                        filler_words: true,
                        utterance_end_ms: 3000,
                      });
                      return;
                    }

                    if (microphoneState === MicrophoneState.Open) {
                      setInput((prev) =>
                        [prev, caption || ''].filter(Boolean).join(' ')
                      );
                      setCaption(undefined);
                      disconnectFromDeepgram();
                      stopMicrophone();
                      return;
                    }
                  }}
                  disabled={
                    isInternalLoading ||
                    microphoneState === MicrophoneState.Opening ||
                    microphoneState === MicrophoneState.Pausing ||
                    microphoneState === MicrophoneState.SettingUp ||
                    microphoneState === MicrophoneState.NotSetup
                  }
                >
                  {microphoneState === MicrophoneState.Open ? (
                    <Mic />
                  ) : (
                    <MicOff />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.voice_input')}</TooltipContent>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('ai_chat.permission_denied')}</DialogTitle>
                  <DialogDescription>
                    {t('ai_chat.microphone_permission_denied')}
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger className="hidden md:flex" asChild>
                <Button
                  disabled={isInternalLoading}
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'transition duration-300',
                    chat?.id && isInternalLoading
                      ? input
                        ? 'mx-1'
                        : 'ml-1'
                      : '',
                    !chat?.id || !isInternalLoading
                      ? 'pointer-events-none w-0 bg-transparent text-transparent opacity-0'
                      : 'pointer-events-auto w-10 opacity-100'
                  )}
                  onClick={() => {
                    setIsInternalLoading(true);
                    router.refresh();

                    setTimeout(() => {
                      setIsInternalLoading(false);
                    }, 1000);
                  }}
                >
                  <RefreshCw
                    className={isInternalLoading ? 'animate-spin' : ''}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.refresh_chat')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  disabled={isInternalLoading || !input}
                  size="icon"
                  className={cn(
                    'transition-all duration-300',
                    !input
                      ? 'pointer-events-none w-0 bg-transparent text-transparent opacity-0'
                      : 'pointer-events-auto w-10 opacity-100'
                  )}
                >
                  <IconArrowElbow />
                  <span className="sr-only">{t('ai_chat.send_message')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.send_message')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

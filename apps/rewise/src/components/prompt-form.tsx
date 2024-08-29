import { DEV_MODE } from '@/constants/common';
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';
import type { AIChat } from '@/types/db';
import { Button } from '@repo/ui/components/ui/button';
import { Dialog } from '@repo/ui/components/ui/dialog';
import { IconArrowElbow } from '@repo/ui/components/ui/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { cn } from '@repo/ui/lib/utils';
import type { UseChatHelpers } from 'ai/react';
import {
  ArrowDownWideNarrow,
  Bolt,
  FileText,
  Globe,
  ImageIcon,
  Languages,
  Lock,
  NotebookPen,
  NotebookTabs,
  Package,
  Paperclip,
  PencilLine,
  RefreshCw,
  SquareStack,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useEffect, useState } from 'react';
import Textarea from 'react-textarea-autosize';

export interface PromptProps
  extends Pick<UseChatHelpers, 'input' | 'setInput'> {
  id: string | undefined;
  chat: Partial<AIChat> | undefined;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  onSubmit: (value: string) => Promise<void>;
  isLoading: boolean;
  showExtraOptions: boolean;
  setShowExtraOptions: React.Dispatch<React.SetStateAction<boolean>>;
  toggleChatFileUpload: () => void;
  toggleChatVisibility: () => void;
}

export function PromptForm({
  onSubmit,
  id,
  chat,
  files,
  setFiles,
  input,
  inputRef,
  setInput,
  isLoading,
  showExtraOptions,
  setShowExtraOptions,
  toggleChatFileUpload,
  toggleChatVisibility,
}: PromptProps) {
  const t = useTranslations();

  const router = useRouter();
  const { formRef, onKeyDown } = useEnterSubmit();

  const [isInternalLoading, setIsInternalLoading] = useState(isLoading);

  useEffect(() => {
    setIsInternalLoading(isLoading);
  }, [isLoading]);

  // const [caption, setCaption] = useState<string | undefined>();
  // const {
  //   connection,
  //   connectToDeepgram,
  //   disconnectFromDeepgram,
  //   connectionState,
  // } = useDeepgram();
  // const {
  //   setupMicrophone,
  //   microphone,
  //   startMicrophone,
  //   stopMicrophone,
  //   microphoneState,
  // } = useMicrophone();

  // const captionTimeout = useRef<any>();
  // const keepAliveInterval = useRef<any>();

  const [showPermissionDenied, setShowPermissionDenied] = useState(false);

  // useEffect(() => {
  //   if (microphoneState === MicrophoneState.NotSetup) {
  //     setupMicrophone();
  //   }

  //   if (
  //     microphoneState === MicrophoneState.Paused &&
  //     connectionState === LiveConnectionState.OPEN
  //   ) {
  //     disconnectFromDeepgram();
  //   }
  // }, [microphoneState]);

  // useEffect(() => {
  //   if (!microphone) {
  //     console.log('!microphone');
  //     return;
  //   }

  //   if (!connection) {
  //     console.log('!connection');
  //     return;
  //   }

  //   console.log('connectionState', connectionState);

  //   const onData = (e: BlobEvent) => {
  //     connection?.send(e.data);
  //   };

  //   const onTranscript = (data: LiveTranscriptionEvent) => {
  //     const { is_final: isFinal, speech_final: speechFinal } = data;
  //     let thisCaption = data.channel.alternatives?.[0]?.transcript;

  //     console.log('thisCaption', thisCaption);
  //     if (thisCaption !== '') {
  //       console.log('thisCaption !== ""', thisCaption);
  //       setCaption(thisCaption);
  //     }

  //     if (isFinal && speechFinal) {
  //       clearTimeout(captionTimeout.current);
  //       captionTimeout.current = setTimeout(() => {
  //         setInput((prev) => [prev, thisCaption].join(' '));
  //         setCaption(undefined);
  //         disconnectFromDeepgram();
  //         stopMicrophone();
  //         clearTimeout(captionTimeout.current);
  //       }, 3000);
  //     }
  //   };

  //   if (connectionState === LiveConnectionState.OPEN) {
  //     connection?.addListener(LiveTranscriptionEvents.Transcript, onTranscript);
  //     microphone?.addEventListener(MicrophoneEvents.DataAvailable, onData);
  //     startMicrophone();
  //   }

  //   return () => {
  //     // prettier-ignore
  //     connection?.removeListener(LiveTranscriptionEvents.Transcript, onTranscript);
  //     microphone?.removeEventListener(MicrophoneEvents.DataAvailable, onData);
  //     clearTimeout(captionTimeout.current);
  //     stopMicrophone();
  //   };
  // }, [microphone, connection, connectionState]);

  // useEffect(() => {
  //   if (!connection) return;

  //   if (
  //     microphoneState !== MicrophoneState.Open &&
  //     connectionState === LiveConnectionState.OPEN
  //   ) {
  //     connection.keepAlive();

  //     keepAliveInterval.current = setInterval(() => {
  //       connection.keepAlive();
  //     }, 10000);
  //   } else {
  //     clearInterval(keepAliveInterval.current);
  //   }

  //   return () => {
  //     clearInterval(keepAliveInterval.current);
  //   };
  // }, [microphoneState, connectionState]);

  const [responseTypes, setResponseTypes] = useState<{
    summary?: boolean;
    notes?: boolean;
    multiChoiceQuiz?: boolean;
    paragraphQuiz?: boolean;
    flashcards?: boolean;
  }>({});

  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setElement(document.getElementById('main-content'));
    return () => {
      setElement(null);
    };
  }, []);

  if (!element) return null;

  const ENABLE_NEW_UI = DEV_MODE;

  return (
    <Dialog open={showPermissionDenied} onOpenChange={setShowPermissionDenied}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!input?.trim()) return;
          setInput('');
          element.scrollTo({
            top: element.scrollHeight,
            behavior: 'smooth',
          });
          await onSubmit(input);
        }}
        ref={formRef}
        className="w-full"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="scrollbar-none flex w-full items-center gap-2 overflow-x-auto font-semibold">
            <Button
              size="xs"
              type="button"
              variant={responseTypes.summary ? undefined : 'secondary'}
              className={cn(
                'border text-xs',
                responseTypes.summary
                  ? 'border-pink-500/20 bg-pink-500/10 text-pink-700 hover:bg-pink-500/20 dark:border-pink-300/20 dark:bg-pink-300/20 dark:text-pink-300 dark:hover:bg-pink-300/30'
                  : 'bg-background'
              )}
              onClick={() =>
                setResponseTypes((types) => ({
                  ...types,
                  summary: !types.summary,
                }))
              }
              disabled={!ENABLE_NEW_UI}
            >
              <ArrowDownWideNarrow className="mr-1 h-4 w-4" />
              {t('ai_chat.chat_summary')}
            </Button>
            <Button
              size="xs"
              type="button"
              variant={responseTypes.notes ? undefined : 'secondary'}
              className={cn(
                'border text-xs',
                responseTypes.notes
                  ? 'border-purple-500/20 bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 dark:border-purple-300/20 dark:bg-purple-300/20 dark:text-purple-300 dark:hover:bg-purple-300/30'
                  : 'bg-background'
              )}
              onClick={() =>
                setResponseTypes((types) => ({
                  ...types,
                  notes: !types.notes,
                }))
              }
              disabled={!ENABLE_NEW_UI}
            >
              <NotebookPen className="mr-1 h-4 w-4" />
              {t('ai_chat.chat_notes')}
            </Button>
            <Button
              size="xs"
              type="button"
              variant={responseTypes.multiChoiceQuiz ? undefined : 'secondary'}
              className={cn(
                'border text-xs',
                responseTypes.multiChoiceQuiz
                  ? 'border-green-500/20 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:border-green-300/20 dark:bg-green-300/20 dark:text-green-300 dark:hover:bg-green-300/30'
                  : 'bg-background'
              )}
              onClick={() =>
                setResponseTypes((types) => ({
                  ...types,
                  multiChoiceQuiz: !types.multiChoiceQuiz,
                }))
              }
              disabled={!ENABLE_NEW_UI}
            >
              <SquareStack className="mr-1 h-4 w-4" />
              {t('ai_chat.multiple_choice')}
            </Button>
            <Button
              size="xs"
              type="button"
              variant={responseTypes.paragraphQuiz ? undefined : 'secondary'}
              className={cn(
                'border text-xs',
                responseTypes.paragraphQuiz
                  ? 'border-orange-500/20 bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:border-orange-300/20 dark:bg-orange-300/20 dark:text-orange-300 dark:hover:bg-orange-300/30'
                  : 'bg-background'
              )}
              onClick={() =>
                setResponseTypes((types) => ({
                  ...types,
                  paragraphQuiz: !types.paragraphQuiz,
                }))
              }
              disabled={!ENABLE_NEW_UI}
            >
              <PencilLine className="mr-1 h-4 w-4" />
              {t('ai_chat.paragraph_answers')}
            </Button>
            <Button
              size="xs"
              type="button"
              variant={responseTypes.flashcards ? undefined : 'secondary'}
              className={cn(
                'border text-xs',
                responseTypes.flashcards
                  ? 'border-blue-500/20 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 dark:border-blue-300/20 dark:bg-blue-300/20 dark:text-blue-300 dark:hover:bg-blue-300/30'
                  : 'bg-background'
              )}
              onClick={() =>
                setResponseTypes((types) => ({
                  ...types,
                  flashcards: !types.flashcards,
                }))
              }
              disabled={!ENABLE_NEW_UI}
            >
              <NotebookTabs className="mr-1 h-4 w-4" />
              {t('ai_chat.flashcards')}
            </Button>
          </div>

          <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  // disabled={isInternalLoading}
                  size="icon"
                  variant="ghost"
                  className={cn('mr-1 transition duration-300')}
                  disabled={!ENABLE_NEW_UI}
                >
                  <Languages />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.response_language')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  // disabled={isInternalLoading}
                  size="icon"
                  variant="ghost"
                  className={cn('transition duration-300')}
                  onClick={toggleChatFileUpload}
                  disabled={!ENABLE_NEW_UI}
                >
                  <Paperclip />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.add_attachments')}</TooltipContent>
            </Tooltip>

            {/* <Tooltip>
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
                  disabled
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
            </Tooltip> */}

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
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'transition duration-300',
                    !id
                      ? 'pointer-events-none w-0 bg-transparent text-transparent opacity-0'
                      : 'pointer-events-auto ml-1 w-10 opacity-100'
                  )}
                  disabled={!id}
                  onClick={toggleChatVisibility}
                >
                  {chat?.is_public ? <Globe /> : <Lock />}
                  <span className="sr-only">
                    {t('ai_chat.chat_visibility')}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.chat_visibility')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  type="submit"
                  variant="ghost"
                  onClick={() => setShowExtraOptions((prev) => !prev)}
                  className={cn(
                    'transition-all duration-300',
                    id
                      ? 'pointer-events-none w-0 bg-transparent text-transparent opacity-0'
                      : 'pointer-events-auto ml-1 w-10 opacity-100'
                  )}
                  disabled={isLoading || showExtraOptions}
                >
                  <Bolt />
                  <span className="sr-only">{t('ai_chat.extra_options')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.extra_options')}</TooltipContent>
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
                      : 'pointer-events-auto ml-1 w-10 opacity-100'
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

        {files && files.length > 0 && (
          <TooltipProvider>
            <div className="mb-2 flex items-center gap-1 text-xs">
              {files.filter((f) => f.name.endsWith('.pdf')).length > 0 && (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="bg-foreground text-background flex w-fit items-center gap-1 rounded px-2 py-1 font-semibold">
                      <FileText className="h-4 w-4" />
                      {files.filter((f) => f.name.endsWith('.pdf')).length} PDFs
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="grid gap-1">
                      {files
                        .filter((f) => f.name.endsWith('.pdf'))
                        .map((f) => (
                          <div
                            key={f.name}
                            className="group flex items-center gap-2 rounded"
                          >
                            <FileText className="h-4 w-4" />
                            <span className="line-clamp-1 w-full max-w-xs">
                              {f.name}
                            </span>
                            <Button
                              size="xs"
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                const newFiles = files.filter((file) => {
                                  return file.name !== f.name;
                                });
                                setFiles(newFiles);
                              }}
                              className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                            >
                              <X />
                            </Button>
                          </div>
                        ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
              {files.filter(
                (f) =>
                  f.name.endsWith('.png') ||
                  f.name.endsWith('.jpg') ||
                  f.name.endsWith('.jpeg')
              ).length > 0 && (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="bg-foreground text-background flex w-fit items-center gap-1 rounded px-2 py-1 font-semibold">
                      <ImageIcon className="h-4 w-4" />
                      {
                        files.filter(
                          (f) =>
                            f.name.endsWith('.png') ||
                            f.name.endsWith('.jpg') ||
                            f.name.endsWith('.jpeg') ||
                            f.name.endsWith('.webp')
                        ).length
                      }{' '}
                      Images
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="grid gap-1">
                      {files
                        .filter(
                          (f) =>
                            f.name.endsWith('.png') ||
                            f.name.endsWith('.jpg') ||
                            f.name.endsWith('.jpeg') ||
                            f.name.endsWith('.webp')
                        )
                        .map((f) => (
                          <div
                            key={f.name}
                            className="group flex items-center gap-2 rounded"
                          >
                            <div className="size-8">
                              <img
                                src={URL.createObjectURL(f)}
                                alt={f.name}
                                className="h-8 w-8 rounded object-cover"
                              />
                            </div>
                            <span className="line-clamp-1 w-full max-w-xs">
                              {f.name}
                            </span>
                            <Button
                              size="xs"
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                const newFiles = files.filter((file) => {
                                  return file.name !== f.name;
                                });
                                setFiles(newFiles);
                              }}
                              className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                            >
                              <X />
                            </Button>
                          </div>
                        ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
              {files.filter(
                (f) =>
                  !f.name.endsWith('.pdf') &&
                  !f.name.endsWith('.png') &&
                  !f.name.endsWith('.jpg') &&
                  !f.name.endsWith('.jpeg') &&
                  !f.name.endsWith('.webp')
              ).length > 0 && (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="bg-foreground text-background flex w-fit items-center gap-1 rounded px-2 py-1 font-semibold">
                      <Package className="h-4 w-4" />
                      {
                        files.filter(
                          (f) =>
                            !f.name.endsWith('.pdf') &&
                            !f.name.endsWith('.png') &&
                            !f.name.endsWith('.jpg') &&
                            !f.name.endsWith('.jpeg') &&
                            !f.name.endsWith('.webp')
                        ).length
                      }{' '}
                      Files
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="grid gap-1">
                      {files
                        .filter(
                          (f) =>
                            !f.name.endsWith('.pdf') &&
                            !f.name.endsWith('.png') &&
                            !f.name.endsWith('.jpg') &&
                            !f.name.endsWith('.jpeg') &&
                            !f.name.endsWith('.webp')
                        )
                        .map((f) => (
                          <div
                            key={f.name}
                            className="group flex items-center gap-2 rounded"
                          >
                            <Package className="h-4 w-4" />
                            <span className="line-clamp-1 w-full max-w-xs">
                              {f.name}
                            </span>
                            <Button
                              size="xs"
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                const newFiles = files.filter((file) => {
                                  return file.name !== f.name;
                                });
                                setFiles(newFiles);
                              }}
                              className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                            >
                              <X />
                            </Button>
                          </div>
                        ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        )}

        <div className="flex max-h-60 w-full items-end overflow-hidden rounded-lg bg-transparent">
          <Textarea
            ref={inputRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            rows={1}
            value={input}
            // value={[input, caption || ''].filter(Boolean).join(' ')}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`${t('ai_chat.send_message')}.`}
            spellCheck={false}
            maxRows={7}
            className="placeholder-foreground/50 scrollbar-none w-full resize-none bg-transparent py-2 focus-within:outline-none sm:text-sm"
          />
        </div>
      </form>
    </Dialog>
  );
}

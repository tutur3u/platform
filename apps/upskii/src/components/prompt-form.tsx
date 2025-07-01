import type { UseChatHelpers } from '@tuturuuu/ai/types';
import type { AIChat } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import type { StatedFile } from '@tuturuuu/ui/custom/file-uploader';
import { Dialog } from '@tuturuuu/ui/dialog';
import {
  Bolt,
  File,
  FileText,
  Globe,
  ImageIcon,
  KeyRound,
  Languages,
  Lock,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useEffect, useState } from 'react';
import Textarea from 'react-textarea-autosize';
import { DEV_MODE } from '@/constants/common';
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';

export interface PromptProps
  extends Pick<UseChatHelpers, 'input' | 'setInput'> {
  id: string | undefined;
  provider: string | undefined;
  model?: string;
  chat: Partial<AIChat> | undefined;
  files: StatedFile[];
  setFiles: React.Dispatch<React.SetStateAction<StatedFile[]>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  // eslint-disable-next-line no-unused-vars
  onSubmit: (value: string) => Promise<void>;
  isLoading: boolean;
  showExtraOptions: boolean;
  setShowExtraOptions: React.Dispatch<React.SetStateAction<boolean>>;
  toggleChatFileUpload: () => void;
  toggleChatVisibility: () => void;
  toggleAPIInput: () => void;
  disabled?: boolean;
  apiKey?: string | null;
}

export function PromptForm({
  onSubmit,
  id,
  provider,
  model,
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
  toggleAPIInput,
  disabled,
  apiKey,
}: PromptProps) {
  const t = useTranslations();

  const router = useRouter();
  const { formRef, onKeyDown } = useEnterSubmit();

  const [isInternalLoading, setIsInternalLoading] = useState(isLoading);

  useEffect(() => {
    setIsInternalLoading(isLoading);
  }, [isLoading]);

  const pdfs = files.filter((f) =>
    f.rawFile.type.startsWith('application/pdf')
  );
  const images = files.filter((f) => f.rawFile.type.startsWith('image/'));
  const others = files.filter((f) => !pdfs.includes(f) && !images.includes(f));

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

  // const [responseTypes, setResponseTypes] = useState<{
  //   summary?: boolean;
  //   notes?: boolean;
  //   multiChoiceQuiz?: boolean;
  //   paragraphQuiz?: boolean;
  //   flashcards?: boolean;
  // }>({});

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
            {model && (
              <>
                <div className="flex shrink-0 items-center gap-1 rounded border border-dynamic-orange/20 bg-dynamic-orange/10 px-2 py-1 text-xs font-semibold text-dynamic-orange">
                  <Sparkles className="h-3 w-3" />
                  <span>
                    {provider && (
                      <span className="opacity-70">
                        {provider.toLowerCase().replace(' ', '-')}/
                      </span>
                    )}
                    {model}
                  </span>
                </div>
                {disabled || (
                  <Separator orientation="vertical" className="h-4" />
                )}
              </>
            )}

            {/* <Button
              size="xs"
              type="button"
              variant={responseTypes.summary ? undefined : 'secondary'}
              className={cn(
                'border text-xs',
                responseTypes.summary
                  ? 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20'
                  : 'bg-background text-foreground/70 hover:bg-foreground/5'
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
                  ? 'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
                  : 'bg-background text-foreground/70 hover:bg-foreground/5'
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
                  ? 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20'
                  : 'bg-background text-foreground/70 hover:bg-foreground/5'
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
                  ? 'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/20'
                  : 'bg-background text-foreground/70 hover:bg-foreground/5'
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
                  ? 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                  : 'bg-background text-foreground/70 hover:bg-foreground/5'
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
            </Button> */}
          </div>

          <div className="flex items-center">
            {disabled || (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    // disabled={isInternalLoading}
                    size="icon"
                    variant="ghost"
                    className={cn('mr-1 transition duration-300')}
                    disabled={!ENABLE_NEW_UI || disabled}
                  >
                    <Languages />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('ai_chat.response_language')}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  // disabled={isInternalLoading}
                  size="icon"
                  variant="ghost"
                  className={cn('transition duration-300')}
                  onClick={toggleChatFileUpload}
                  disabled={!ENABLE_NEW_UI || disabled}
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
                  disabled={!id || disabled}
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
                  disabled={isLoading || showExtraOptions || disabled}
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
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'transition-all duration-300',
                    id
                      ? 'pointer-events-none w-0 bg-transparent text-transparent opacity-0'
                      : 'pointer-events-auto ml-1 w-10 opacity-100'
                  )}
                  onClick={toggleAPIInput}
                >
                  <KeyRound />
                  <span className="sr-only">{t('ai_chat.api_key')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.api_key')}</TooltipContent>
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
                  <Send />
                  <span className="sr-only">{t('ai_chat.send_message')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.send_message')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {files.length > 0 && (
          <TooltipProvider>
            <div className="mb-2 flex items-center gap-1 text-xs">
              {pdfs.length > 0 && (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="flex w-fit items-center gap-1 rounded bg-foreground px-2 py-1 font-semibold text-background">
                      <FileText className="h-4 w-4" />
                      {pdfs.length} PDFs
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="grid gap-1">
                      {pdfs.map((f) => (
                        <div
                          key={f.url}
                          className="group flex items-center gap-2 rounded"
                        >
                          <FileText className="h-4 w-4" />
                          <span className="line-clamp-1 w-full max-w-xs">
                            {f.rawFile.name}
                          </span>
                          <Button
                            size="xs"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              const newFiles = files.filter((file) => {
                                return file.url !== f.url;
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
              {images.length > 0 && (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="flex w-fit items-center gap-1 rounded bg-foreground px-2 py-1 font-semibold text-background">
                      <ImageIcon className="h-4 w-4" />
                      {images.length} Images
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="grid gap-1">
                      {images.map((f) => (
                        <div
                          key={f.url}
                          className="group flex items-center gap-2 rounded"
                        >
                          <div className="size-8">
                            {/** biome-ignore lint/performance/noImgElement: <Raw image> */}
                            <img
                              src={URL.createObjectURL(f.rawFile)}
                              alt={f.rawFile.name}
                              className="h-8 w-8 rounded object-cover"
                            />
                          </div>
                          <span className="line-clamp-1 w-full max-w-xs">
                            {f.rawFile.name}
                          </span>
                          <Button
                            size="xs"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              const newFiles = files.filter((file) => {
                                return file.url !== f.url;
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
              {others.length > 0 && (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="flex w-fit items-center gap-1 rounded bg-foreground px-2 py-1 font-semibold text-background">
                      <File className="h-4 w-4" />
                      {others.length} Files
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="grid gap-1">
                      {others.map((f) => (
                        <div
                          key={f.url}
                          className="group flex items-center gap-2 rounded"
                        >
                          <File className="h-4 w-4" />
                          <span className="line-clamp-1 w-full max-w-xs">
                            {f.rawFile.name}
                          </span>
                          <Button
                            size="xs"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              const newFiles = files.filter((file) => {
                                return file.url !== f.url;
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
            placeholder={
              disabled || !apiKey
                ? t('ai_chat.api_key_required')
                : `${t('ai_chat.send_message')}`
            }
            spellCheck={false}
            maxRows={7}
            className="scrollbar-none w-full resize-none bg-transparent py-2 placeholder-foreground/50 focus-within:outline-hidden sm:text-sm"
            disabled={disabled || !apiKey}
          />
        </div>
      </form>
    </Dialog>
  );
}

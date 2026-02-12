import {
  Bolt,
  File,
  FileText,
  Globe,
  ImageIcon,
  Languages,
  Lock,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from '@tuturuuu/icons';
import type { AIChat } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import type { StatedFile } from '@tuturuuu/ui/custom/file-uploader';
import { Dialog } from '@tuturuuu/ui/dialog';
import { useEnterSubmit } from '@tuturuuu/ui/hooks/use-enter-submit';
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

export interface PromptProps {
  id: string | undefined;
  provider: string | undefined;
  model?: string;
  chat: Partial<AIChat> | undefined;
  files: StatedFile[];
  setFiles: React.Dispatch<React.SetStateAction<StatedFile[]>>;
  input: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  setInput: (input: string) => void;
  onSubmit: (value: string) => Promise<void>;
  isLoading: boolean;
  showExtraOptions: boolean;
  setShowExtraOptions: React.Dispatch<React.SetStateAction<boolean>>;
  toggleChatFileUpload: () => void;
  toggleChatVisibility: () => void;
  disabled?: boolean;
}

export function PromptForm({
  id,
  provider,
  model,
  chat,
  files,
  setFiles,
  input,
  inputRef,
  setInput,
  onSubmit,
  isLoading,
  showExtraOptions,
  setShowExtraOptions,
  toggleChatFileUpload,
  toggleChatVisibility,
  disabled,
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

  const [showPermissionDenied, setShowPermissionDenied] = useState(false);

  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setElement(document.getElementById('main-content'));
    return () => {
      setElement(null);
    };
  }, []);

  if (!element) return null;

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
                <div className="flex shrink-0 items-center gap-1 rounded border border-dynamic-orange/20 bg-dynamic-orange/10 px-2 py-1 font-semibold text-dynamic-orange text-xs">
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
                    disabled
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
                  disabled={disabled}
                >
                  <Paperclip />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.add_attachments')}</TooltipContent>
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
              disabled
                ? t('ai_chat.imagine_placeholder')
                : `${t('ai_chat.send_message')}.`
            }
            spellCheck={false}
            maxRows={7}
            className="scrollbar-none w-full resize-none bg-transparent py-2 placeholder-foreground/50 focus-within:outline-hidden sm:text-sm"
            disabled={disabled}
          />
        </div>
      </form>
    </Dialog>
  );
}

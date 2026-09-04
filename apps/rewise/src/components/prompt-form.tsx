import {
  File as FileIcon,
  FileText,
  Globe,
  ImageIcon,
  Lock,
  Paperclip,
  Send,
  Sparkles,
  X,
} from '@tuturuuu/icons';
import type { AIChat, AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import type { StatedFile } from '@tuturuuu/ui/custom/file-uploader';
import { useEnterSubmit } from '@tuturuuu/ui/hooks/use-enter-submit';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type React from 'react';
import Textarea from 'react-textarea-autosize';

export interface PromptProps {
  id?: string;
  model?: AIModelUI;
  chat: Partial<AIChat> | undefined;
  files: StatedFile[];
  setFiles: React.Dispatch<React.SetStateAction<StatedFile[]>>;
  input: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  setInput: (input: string) => void;
  onSubmit: (value: string) => Promise<void>;
  isLoading: boolean;
  toggleChatFileUpload: () => void;
  toggleChatVisibility: () => void;
  disabled?: boolean;
}

function FileTypeIcon({ file }: { file: File }) {
  if (file.type.startsWith('image/')) return <ImageIcon className="size-3.5" />;
  if (file.type === 'application/pdf') return <FileText className="size-3.5" />;
  return <FileIcon className="size-3.5" />;
}

export function PromptForm({
  id,
  model,
  chat,
  files,
  setFiles,
  input,
  inputRef,
  setInput,
  onSubmit,
  isLoading,
  toggleChatFileUpload,
  toggleChatVisibility,
  disabled,
}: PromptProps) {
  const t = useTranslations();
  const { formRef, onKeyDown } = useEnterSubmit();
  const canSubmit = !!input.trim() && !isLoading && !disabled;

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit) return;

        const submittedInput = input.trim();
        setInput('');
        const scrollContainer =
          document.getElementById('main-chat-content') ??
          document.scrollingElement;
        scrollContainer?.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth',
        });

        try {
          await onSubmit(submittedInput);
        } catch {
          setInput(submittedInput);
        }
      }}
      ref={formRef}
      className="overflow-hidden rounded-xl border border-border/50 bg-background/90 shadow-lg backdrop-blur-xl transition-colors focus-within:border-primary/40"
    >
      <div className="flex min-h-9 items-center gap-1.5 border-border/40 border-b px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 px-1.5 text-muted-foreground text-xs">
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <span className="truncate font-medium text-foreground">
            {model?.label ?? t('ai_chat.default_chat')}
          </span>
          {model?.provider ? (
            <span className="hidden truncate sm:inline">
              · {model.provider}
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={toggleChatFileUpload}
                disabled={disabled}
                aria-label={t('ai_chat.add_attachments')}
              >
                <Paperclip className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('ai_chat.add_attachments')}</TooltipContent>
          </Tooltip>

          {id ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={toggleChatVisibility}
                  disabled={disabled}
                  aria-label={t('ai_chat.chat_visibility')}
                >
                  {chat?.is_public ? (
                    <Globe className="size-4" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai_chat.chat_visibility')}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {files.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto border-border/40 border-b px-3 py-2">
          {files.map((file) => (
            <div
              key={file.url}
              className="flex max-w-48 shrink-0 items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2 py-1 text-xs"
            >
              <FileTypeIcon file={file.rawFile} />
              <span className="truncate">{file.rawFile.name}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-5 shrink-0"
                onClick={() =>
                  setFiles((current) =>
                    current.filter((candidate) => candidate.url !== file.url)
                  )
                }
                aria-label={`${t('common.remove')} ${file.rawFile.name}`}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex min-w-0 items-end gap-2 p-2">
        <Textarea
          ref={inputRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          rows={1}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            disabled
              ? t('ai_chat.imagine_placeholder')
              : t('ai_chat.prompt_placeholder')
          }
          spellCheck={false}
          maxRows={6}
          className="scrollbar-none min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm placeholder:text-muted-foreground focus:outline-none"
          disabled={disabled}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="submit"
              size="icon"
              className={cn(
                'size-9 shrink-0 transition-colors',
                !canSubmit && 'bg-muted text-muted-foreground'
              )}
              disabled={!canSubmit}
              aria-label={t('ai_chat.send_message')}
            >
              <Send className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('ai_chat.send_message')}</TooltipContent>
        </Tooltip>
      </div>
    </form>
  );
}

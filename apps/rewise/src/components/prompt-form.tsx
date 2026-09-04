import {
  File as FileIcon,
  FileText,
  ImageIcon,
  Mic,
  Paperclip,
  Send,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { StatedFile } from '@tuturuuu/ui/custom/file-uploader';
import { useEnterSubmit } from '@tuturuuu/ui/hooks/use-enter-submit';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type React from 'react';
import Textarea from 'react-textarea-autosize';

export interface PromptProps {
  assistantName: string;
  files: StatedFile[];
  setFiles: React.Dispatch<React.SetStateAction<StatedFile[]>>;
  input: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  setInput: (input: string) => void;
  onSubmit: (value: string) => Promise<void>;
  isLoading: boolean;
  toggleChatFileUpload: () => void;
  disabled?: boolean;
}

function FileTypeIcon({ file }: { file: File }) {
  if (file.type.startsWith('image/')) return <ImageIcon className="size-3.5" />;
  if (file.type === 'application/pdf') return <FileText className="size-3.5" />;
  return <FileIcon className="size-3.5" />;
}

export function PromptForm({
  assistantName,
  files,
  setFiles,
  input,
  inputRef,
  setInput,
  onSubmit,
  isLoading,
  toggleChatFileUpload,
  disabled,
}: PromptProps) {
  const t = useTranslations('ai_chat');
  const commonT = useTranslations('common');
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
      className={cn(
        'flex min-w-0 flex-col justify-center rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm',
        'transition-colors focus-within:border-dynamic-purple/30'
      )}
    >
      {files.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto px-2 pt-2">
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
                aria-label={`${commonT('remove')} ${file.rawFile.name}`}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-2 p-2">
        <Textarea
          ref={inputRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          rows={1}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            disabled
              ? t('imagine_placeholder')
              : t('prompt_placeholder', { name: assistantName })
          }
          spellCheck={false}
          maxRows={5}
          className="scrollbar-none min-h-10.5 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm placeholder:text-muted-foreground focus:outline-none"
          disabled={disabled}
        />

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                onClick={toggleChatFileUpload}
                disabled={disabled}
                aria-label={t('add_attachments')}
              >
                <Paperclip className="size-4.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('add_attachments')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                disabled
                aria-label={t('voice_input')}
              >
                <Mic className="size-4.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('voice_input')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                size="icon"
                className={cn(
                  'size-9 shrink-0 transition-all',
                  canSubmit
                    ? 'bg-dynamic-purple text-primary-foreground hover:bg-dynamic-purple/90'
                    : 'bg-muted text-muted-foreground'
                )}
                disabled={!canSubmit}
                aria-label={t('send_message')}
              >
                <Send className="size-4.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('send_message')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </form>
  );
}

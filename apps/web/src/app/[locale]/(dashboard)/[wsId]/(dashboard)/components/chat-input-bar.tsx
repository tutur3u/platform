'use client';

import { Mic, Paperclip, Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useEnterSubmit } from '@tuturuuu/ui/hooks/use-enter-submit';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type RefObject, useCallback, useRef } from 'react';
import Textarea from 'react-textarea-autosize';
import type { ChatFile } from './file-preview-chips';
import FilePreviewChips from './file-preview-chips';

/** Max file size: 50 MB (accommodates short video clips) */
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILE_COUNT = 5;

const ACCEPTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/json',
  'text/markdown',
]);

const ACCEPTED_EXTENSIONS = new Set([
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.doc',
  '.docx',
]);

const ACCEPT_STRING = [...ACCEPTED_MIME_TYPES, ...ACCEPTED_EXTENSIONS].join(
  ','
);

function isAcceptedFile(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  if (ACCEPTED_MIME_TYPES.has(mimeType)) return true;

  const fileName = file.name.toLowerCase();
  const extIndex = fileName.lastIndexOf('.');
  if (extIndex !== -1) {
    const ext = fileName.substring(extIndex);
    return ACCEPTED_EXTENSIONS.has(ext);
  }
  return false;
}

/**
 * Filters an array of raw `File` objects against the size, type/extension, and
 * remaining-capacity constraints. Returns only the files that pass all checks.
 */
function filterValidFiles(candidates: File[], currentCount: number): File[] {
  const valid: File[] = [];

  for (const file of candidates) {
    // Enforce max count
    if (currentCount + valid.length >= MAX_FILE_COUNT) break;

    // Enforce size limit
    if (file.size > MAX_FILE_SIZE) continue;

    // Enforce accepted types/extensions
    if (!isAcceptedFile(file)) continue;

    valid.push(file);
  }

  return valid;
}

interface ChatInputBarProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (value: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
  assistantName: string;
  onVoiceToggle?: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** Currently attached files */
  files?: ChatFile[];
  /** Callback when user selects new files via the file picker */
  onFilesSelected?: (files: File[]) => void;
  /** Callback to remove an attached file by id */
  onFileRemove?: (id: string) => void;
  /** Whether file uploads are permitted for the current model */
  canUploadFiles?: boolean;
}

export default function ChatInputBar({
  input,
  setInput,
  onSubmit,
  isStreaming,
  disabled,
  assistantName,
  onVoiceToggle,
  inputRef: externalRef,
  files = [],
  onFilesSelected,
  onFileRemove,
  canUploadFiles = true,
}: ChatInputBarProps) {
  const t = useTranslations('dashboard.mira_chat');
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { formRef, onKeyDown } = useEnterSubmit();

  const hasFiles = files.length > 0;
  const isUploading = files.some((f) => f.status === 'uploading');
  const canSubmit = (input.trim() || hasFiles) && !isUploading;
  const fileUploadsEnabled = !!onFilesSelected && canUploadFiles;

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!fileUploadsEnabled) return;
      const selectedFiles = e.target.files;
      if (!selectedFiles || selectedFiles.length === 0) return;

      const valid = filterValidFiles(Array.from(selectedFiles), files.length);

      if (valid.length > 0) {
        onFilesSelected?.(valid);
      }

      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [files.length, onFilesSelected, fileUploadsEnabled]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!onFilesSelected || !fileUploadsEnabled) return;

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // Collect files from clipboard items. This handles:
      // - Screenshots pasted from the OS clipboard
      // - Files copied from the file system (on supported browsers)
      // - Images copied from web pages
      const candidates: File[] = [];

      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (!item || item.kind !== 'file') continue;

        const file = item.getAsFile();
        if (file) candidates.push(file);
      }

      if (candidates.length === 0) return;

      const valid = filterValidFiles(candidates, files.length);

      if (valid.length > 0) {
        onFilesSelected(valid);
      }

      // If the clipboard only contained files (no text), prevent the default
      // paste so the browser doesn't insert a file-name string or a blank
      // character into the textarea.
      const hasTextContent = clipboardData.getData('text/plain').length > 0;
      if (!hasTextContent) {
        e.preventDefault();
      }
    },
    [files.length, onFilesSelected, fileUploadsEnabled]
  );

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (!canSubmit) return;
        if (!trimmed && !hasFiles) return;
        onSubmit(trimmed);
        setInput('');
      }}
      className={cn(
        'flex min-w-0 flex-col justify-center rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm',
        'transition-colors focus-within:border-dynamic-purple/30'
      )}
    >
      {/* File preview chips — shown above the textarea when files are attached */}
      {hasFiles && onFileRemove && (
        <div className="px-2 pt-2">
          <FilePreviewChips
            files={files}
            onRemove={onFileRemove}
            disabled={isStreaming}
          />
        </div>
      )}

      {/* Textarea + action buttons row */}
      <div className="flex min-w-0 items-center gap-2 p-2">
        <Textarea
          ref={textareaRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPaste={handlePaste}
          rows={1}
          maxRows={5}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('placeholder', { name: assistantName })}
          spellCheck={false}
          disabled={disabled}
          className="scrollbar-none min-h-10.5 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm placeholder-muted-foreground focus:outline-none"
        />

        <div className="flex items-center gap-1">
          {/* Attach files button */}
          {fileUploadsEnabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-9 w-9 shrink-0 transition-colors',
                    hasFiles && 'text-dynamic-purple'
                  )}
                  onClick={handleAttachClick}
                  disabled={disabled || files.length >= MAX_FILE_COUNT}
                >
                  <Paperclip className="h-4.5 w-4.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {files.length >= MAX_FILE_COUNT
                  ? t('max_files_reached')
                  : t('attach_files')}
              </TooltipContent>
            </Tooltip>
          )}

          {onVoiceToggle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={onVoiceToggle}
                  disabled={disabled}
                >
                  <Mic className="h-4.5 w-4.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('voice_input')}</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                size="icon"
                className={cn(
                  'h-9 w-9 shrink-0 transition-all',
                  canSubmit
                    ? 'bg-dynamic-purple text-white hover:bg-dynamic-purple/90'
                    : 'bg-muted text-muted-foreground'
                )}
                disabled={!canSubmit || disabled}
              >
                <Send className="h-4.5 w-4.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('send_message')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_STRING}
        multiple
        onChange={handleFileInputChange}
        className="hidden"
        tabIndex={-1}
      />
    </form>
  );
}

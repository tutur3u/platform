'use client';

import { Paperclip, Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';
import { MindAiAttachmentChips } from './mind-ai-attachment-chips';
import type { MindChatFile } from './use-mind-ai-attachments';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILE_COUNT = 5;
const ACCEPTED_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);
const ACCEPTED_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.md',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
]);
const ACCEPT_STRING = [...ACCEPTED_MIME_TYPES, ...ACCEPTED_EXTENSIONS].join(
  ','
);

function isAcceptedFile(file: File) {
  const mimeType = file.type.toLowerCase();
  if (ACCEPTED_MIME_TYPES.has(mimeType)) return true;
  const extension = file.name
    .slice(Math.max(0, file.name.lastIndexOf('.')))
    .toLowerCase();
  return ACCEPTED_EXTENSIONS.has(extension);
}

function filterFiles(files: File[], currentCount: number) {
  const accepted: File[] = [];
  for (const file of files) {
    if (currentCount + accepted.length >= MAX_FILE_COUNT) break;
    if (file.size > MAX_FILE_SIZE) continue;
    if (!isAcceptedFile(file)) continue;
    accepted.push(file);
  }
  return accepted;
}

export function MindAiInput({
  disabled,
  files = [],
  input,
  isBusy,
  onAddFiles,
  onInputChange,
  onRemoveFile,
  onSubmit,
  panelFullscreen,
}: {
  disabled?: boolean;
  files: MindChatFile[];
  input: string;
  isBusy: boolean;
  panelFullscreen?: boolean;
  onAddFiles: (files: File[]) => void;
  onInputChange: (value: string) => void;
  onRemoveFile: (id: string) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('mind');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasUploadingFile = files.some((file) => file.status === 'uploading');
  const hasUploadedFile = files.some((file) => file.status === 'uploaded');
  const canSubmit =
    !disabled &&
    !isBusy &&
    !hasUploadingFile &&
    (!!input.trim() || hasUploadedFile);

  const addSelectedFiles = useCallback(
    (selectedFiles: File[]) => {
      const nextFiles = filterFiles(selectedFiles, files.length);
      if (nextFiles.length) onAddFiles(nextFiles);
    },
    [files.length, onAddFiles]
  );

  return (
    <form
      className="border-border border-t bg-background/95 p-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div
        className={cn(
          'rounded-xl border border-border bg-card/80',
          panelFullscreen && 'mx-auto max-w-6xl'
        )}
      >
        <MindAiAttachmentChips
          disabled={isBusy}
          files={files}
          onRemove={onRemoveFile}
        />
        <div className="flex items-end gap-1.5 p-1.5">
          <Textarea
            className="max-h-28 min-h-10 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none outline-none focus-visible:ring-0! focus-visible:ring-offset-0!"
            disabled={disabled || isBusy}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (canSubmit) onSubmit();
              }
            }}
            onPaste={(event) => {
              const candidates: File[] = [];
              for (const item of event.clipboardData.items) {
                if (item.kind !== 'file') continue;
                const file = item.getAsFile();
                if (file) candidates.push(file);
              }
              if (!candidates.length) return;
              addSelectedFiles(candidates);
              if (!event.clipboardData.getData('text/plain')) {
                event.preventDefault();
              }
            }}
            placeholder={disabled ? t('ai.selectBoard') : t('ai.placeholder')}
            value={input}
          />
          <div className="flex shrink-0 gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-9 w-9"
                  disabled={
                    disabled || isBusy || files.length >= MAX_FILE_COUNT
                  }
                  onClick={() => fileInputRef.current?.click()}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('ai.attachFiles')}</TooltipContent>
            </Tooltip>
            <Button
              className="h-9 w-9"
              disabled={!canSubmit}
              size="icon"
              type="submit"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">{t('ai.send')}</span>
            </Button>
          </div>
        </div>
      </div>
      <input
        accept={ACCEPT_STRING}
        className="hidden"
        multiple
        onChange={(event) => {
          const selectedFiles = event.target.files;
          if (selectedFiles) addSelectedFiles(Array.from(selectedFiles));
          event.target.value = '';
        }}
        ref={fileInputRef}
        type="file"
      />
    </form>
  );
}

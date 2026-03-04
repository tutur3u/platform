'use client';

import {
  AudioLines,
  CircleStop,
  Loader2,
  Mic,
  Paperclip,
  Send,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useEnterSubmit } from '@tuturuuu/ui/hooks/use-enter-submit';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type RefObject, useCallback, useRef } from 'react';
import Textarea from 'react-textarea-autosize';
import type { ChatFile } from './file-preview-chips';
import FilePreviewChips from './file-preview-chips';
import { useChatAudioRecorder } from './use-chat-audio-recorder';

/** Max file size: 50 MB (accommodates short video clips) */
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILE_COUNT = 5;

const ACCEPTED_MIME_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
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
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.ogg',
  '.wav',
  '.webm',
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
  onFilesSelected?: (files: File[]) => Promise<number> | number | undefined;
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
  const inputValueRef = useRef(input);
  const { formRef, onKeyDown } = useEnterSubmit();
  inputValueRef.current = input;

  const hasFiles = files.length > 0;
  const isUploading = files.some((f) => f.status === 'uploading');
  const fileUploadsEnabled = !!onFilesSelected && canUploadFiles;
  const maxFilesReached = files.length >= MAX_FILE_COUNT;
  const {
    browserSupportsAudioCapture,
    cancelRecording,
    elapsedMs,
    formatDuration,
    isRecording,
    recordingState,
    startRecording,
    stopRecording,
  } = useChatAudioRecorder({
    disabled: disabled || !fileUploadsEnabled || maxFilesReached,
    onAudioReady: async (file, options) => {
      const uploadedCount = (await onFilesSelected?.([file])) ?? 0;
      if (!options.submitOnReady || uploadedCount <= 0) return;

      const trimmed = inputValueRef.current.trim();
      onSubmit(trimmed);
      setInput('');
    },
  });
  const isPreparingAudio =
    recordingState === 'processing' || recordingState === 'requesting';
  const hasPendingAudio = isRecording || isPreparingAudio;
  const audioUploadsEnabled = fileUploadsEnabled && browserSupportsAudioCapture;
  const canSubmit =
    (input.trim() || hasFiles) && !hasPendingAudio && !isUploading;

  const recordingTitle =
    recordingState === 'processing' || recordingState === 'requesting'
      ? t('preparing_audio')
      : t('recording_audio');

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

  const handleAudioToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
      return;
    }

    if (recordingState === 'idle') {
      void startRecording();
    }
  }, [isRecording, recordingState, startRecording, stopRecording]);

  const handleImmediateAudioSend = useCallback(() => {
    stopRecording({ submitOnReady: true });
  }, [stopRecording]);

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
        'flex min-w-0 flex-col justify-center rounded-[1.35rem] border bg-background/90 shadow-lg backdrop-blur-xl transition-colors',
        hasPendingAudio || hasFiles
          ? 'border-foreground/12'
          : 'border-border/60',
        'focus-within:border-foreground/18'
      )}
    >
      {hasPendingAudio && (
        <div className="px-2 pt-2">
          <div className="overflow-hidden rounded-[1.05rem] border border-border/60 bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className={cn(
                    'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background',
                    isRecording
                      ? 'border-foreground/10 text-foreground'
                      : 'border-border/60 text-muted-foreground',
                    isPreparingAudio && 'text-foreground'
                  )}
                >
                  {isRecording && (
                    <span className="absolute inset-0 rounded-full border border-foreground/10" />
                  )}
                  {isPreparingAudio ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AudioLines className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    {isRecording && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-dynamic-red" />
                    )}
                    <p className="truncate font-medium text-foreground">
                      {recordingTitle}
                    </p>
                    {!isPreparingAudio && (
                      <span className="rounded-full border border-border/50 bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {formatDuration(elapsedMs)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {isRecording && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full border border-border/50 bg-background text-muted-foreground"
                    onClick={cancelRecording}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                {isRecording && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-border/60 bg-background px-3"
                    onClick={() => stopRecording()}
                  >
                    <CircleStop className="mr-1.5 h-4 w-4" />
                    {t('stop_recording')}
                  </Button>
                )}
                {isRecording && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/90"
                        onClick={handleImmediateAudioSend}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('send_immediately')}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
      <div className="flex min-w-0 items-end gap-2 p-2">
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
          className="scrollbar-none min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm placeholder-muted-foreground focus:outline-none"
        />

        <div className="flex items-center gap-1 pb-0.5">
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
                    hasFiles && 'text-foreground'
                  )}
                  onClick={handleAttachClick}
                  disabled={disabled || maxFilesReached || hasPendingAudio}
                >
                  <Paperclip className="h-4.5 w-4.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {maxFilesReached ? t('max_files_reached') : t('attach_files')}
              </TooltipContent>
            </Tooltip>
          )}

          {audioUploadsEnabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-9 w-9 shrink-0 rounded-full transition-all',
                    isRecording
                      ? 'bg-foreground text-background'
                      : 'border border-transparent text-muted-foreground hover:border-border hover:bg-muted/60'
                  )}
                  onClick={handleAudioToggle}
                  disabled={disabled || maxFilesReached || isPreparingAudio}
                >
                  {isPreparingAudio ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : isRecording ? (
                    <CircleStop className="h-4.5 w-4.5" />
                  ) : (
                    <AudioLines className="h-4.5 w-4.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {maxFilesReached
                  ? t('max_files_reached')
                  : isRecording
                    ? t('stop_recording')
                    : t('record_audio')}
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
                  disabled={disabled || hasPendingAudio}
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

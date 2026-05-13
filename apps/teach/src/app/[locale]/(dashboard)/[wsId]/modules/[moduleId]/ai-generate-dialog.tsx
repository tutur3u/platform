'use client';

import {
  AlertCircle,
  Check,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  X,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useAiGenerate } from './use-ai-generate';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
];

const ACCEPTED_FILE_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md'];
const ACCEPTED_EXTENSIONS = ACCEPTED_FILE_EXTENSIONS.join(',');
const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasAcceptedExtension(fileName: string) {
  const lowerName = fileName.toLowerCase();
  return ACCEPTED_FILE_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension)
  );
}

interface AiGenerateDialogProps {
  wsId: string;
  courseId: string;
  onClose: () => void;
}

export function AiGenerateDialog({
  wsId,
  courseId,
  onClose,
}: AiGenerateDialogProps) {
  const t = useTranslations('teachModules.aiGenerate');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useAiGenerate(wsId, courseId);

  const stage = (() => {
    if (mutation.isPending) {
      return uploadProgress < 100 ? 'uploading' : 'generating';
    }
    if (mutation.isSuccess) return 'done';
    if (mutation.isError) return 'error';
    return 'idle';
  })();

  function validateFile(f: File): string | null {
    const hasAcceptedType =
      ACCEPTED_TYPES.includes(f.type) || hasAcceptedExtension(f.name);

    if (!hasAcceptedType) {
      return t('errors.unsupportedFileType');
    }
    if (f.size > MAX_SIZE_BYTES) {
      return t('errors.fileTooLarge', {
        fileSize: formatBytes(f.size),
        maxSize: MAX_SIZE_MB,
      });
    }
    return null;
  }

  function pickFile(f: File) {
    const err = validateFile(f);
    setFileError(err);
    if (!err) setFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) pickFile(dropped);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) pickFile(picked);
    e.target.value = '';
  }

  function handleGenerate() {
    if (!file || mutation.isPending) return;
    setUploadProgress(0);
    mutation.mutate({
      file,
      onProgress: (pct) => setUploadProgress(pct),
    });
  }

  const isDone = stage === 'done';
  const isActive = stage === 'uploading' || stage === 'generating';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isActive) onClose();
      }}
    >
      {/* Panel */}
      <div className="w-full max-w-lg border-2 border-border bg-background shadow-[8px_8px_0_var(--border)]">
        {/* Header */}
        <div className="flex items-center gap-3 border-border border-b-2 bg-dynamic-yellow/15 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-border bg-background shadow-[2px_2px_0_var(--border)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-lg leading-tight">{t('title')}</h2>
            <p className="text-muted-foreground text-xs">{t('description')}</p>
          </div>
          {!isActive && (
            <button
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              type="button"
              aria-label={t('actions.close')}
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="space-y-4 p-5">
          {/* ── Success state ─────────────────────────────────────────────── */}
          {isDone && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 border-2 border-border bg-dynamic-green/15 px-4 py-3 shadow-[3px_3px_0_var(--border)]">
                <Check className="h-5 w-5 shrink-0 text-dynamic-green" />
                <div>
                  <p className="font-bold text-sm">{t('success.title')}</p>
                  <p className="text-muted-foreground text-xs">
                    {t('success.description')}
                  </p>
                </div>
              </div>
              <button
                className="w-full border-2 border-border bg-primary py-2 font-bold text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
                onClick={onClose}
                type="button"
              >
                {t('actions.done')}
              </button>
            </div>
          )}

          {/* ── In-progress state ─────────────────────────────────────────── */}
          {isActive && (
            <div className="space-y-4">
              <div className="border-2 border-border bg-muted/40 px-4 py-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-bold">
                    {stage === 'uploading'
                      ? t('status.uploading')
                      : t('status.generating')}
                  </span>
                  {stage === 'uploading' && (
                    <span className="text-muted-foreground tabular-nums">
                      {uploadProgress}%
                    </span>
                  )}
                </div>
                {stage === 'uploading' ? (
                  <div className="h-2 w-full border border-border bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('status.analyzing')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Idle / error state ────────────────────────────────────────── */}
          {!isDone && !isActive && (
            <>
              {/* Drop zone */}
              <div
                className={cn(
                  'border-2 border-border border-dashed bg-muted/30 p-6 text-center transition-colors hover:bg-muted/50',
                  dragOver && 'border-primary bg-primary/5'
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  className="sr-only"
                  onChange={onInputChange}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="h-8 w-8 shrink-0 text-primary" />
                    <div className="min-w-0 text-left">
                      <p className="truncate font-bold text-sm">{file.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatBytes(file.size)}
                      </p>
                    </div>
                    <button
                      className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setFileError(null);
                      }}
                      type="button"
                      aria-label={t('actions.removeFile')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="w-full space-y-2"
                    onClick={() => inputRef.current?.click()}
                    type="button"
                    aria-label={t('actions.uploadFile')}
                  >
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="font-bold text-sm">{t('dropzone.title')}</p>
                    <p className="text-muted-foreground text-xs">
                      {t('dropzone.description', { maxSize: MAX_SIZE_MB })}
                    </p>
                  </button>
                )}
              </div>

              {/* File error */}
              {fileError && (
                <div className="flex items-start gap-2 border-2 border-border bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {fileError}
                </div>
              )}

              {/* Mutation error */}
              {mutation.isError && (
                <div className="flex items-start gap-2 border-2 border-border bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {mutation.error.message}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2">
                <button
                  className="border-2 border-border bg-card px-4 py-2 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
                  onClick={onClose}
                  type="button"
                >
                  {t('actions.cancel')}
                </button>
                <button
                  className="inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_var(--border)]"
                  disabled={!file || !!fileError}
                  onClick={handleGenerate}
                  type="button"
                >
                  <Sparkles className="h-4 w-4" />
                  {t('actions.generate')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

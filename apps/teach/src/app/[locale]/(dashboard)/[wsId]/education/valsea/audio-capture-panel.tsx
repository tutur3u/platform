'use client';

import { FileAudio, Mic, Pause, Trash2, Upload } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import type { useTranslations } from 'next-intl';

export function AudioCapturePanel({
  audioPreviewUrl,
  file,
  isRecording,
  onClearAudio,
  onFileChange,
  onStartRecording,
  onStopRecording,
  recordingError,
  t,
  uploadProgress,
}: {
  audioPreviewUrl?: string;
  file?: File;
  isRecording: boolean;
  onClearAudio: () => void;
  onFileChange: (value: File | undefined) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  recordingError?: string;
  t: ReturnType<typeof useTranslations>;
  uploadProgress?: number | null;
}) {
  return (
    <div className="rounded-md border border-dynamic-cyan/20 bg-dynamic-cyan/5 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Label className="flex items-center gap-2" htmlFor="valsea-audio">
            <FileAudio className="h-4 w-4 text-dynamic-cyan" />
            {t('audio_label')}
          </Label>
          <p className="mt-1 text-foreground/58 text-xs leading-5">
            {t('audio_drive_hint')}
          </p>
        </div>
        {file ? (
          <Button
            aria-label={t('audio_clear')}
            className="h-9 w-9 shrink-0"
            onClick={onClearAudio}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            accept="audio/mp3,audio/mpeg,audio/mp4,audio/m4a,audio/ogg,audio/wav,audio/webm,audio/flac"
            disabled={isRecording}
            id="valsea-audio"
            onChange={(event) => onFileChange(event.target.files?.[0])}
            type="file"
          />
          <Button
            className={
              isRecording
                ? 'gap-2 border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/15'
                : 'gap-2 border-dynamic-cyan/25 bg-dynamic-cyan/10 text-dynamic-cyan hover:bg-dynamic-cyan/15'
            }
            onClick={isRecording ? onStopRecording : onStartRecording}
            type="button"
            variant="outline"
          >
            {isRecording ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {isRecording ? t('audio_stop_recording') : t('audio_record_live')}
          </Button>
        </div>

        {file ? (
          <div className="rounded-md border border-foreground/10 bg-background/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-sm">{file.name}</div>
                <div className="mt-1 text-foreground/55 text-xs">
                  {formatFileSize(file.size)}
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-dynamic-green/20 bg-dynamic-green/10 px-2.5 py-1 text-dynamic-green text-xs">
                <Upload className="h-3.5 w-3.5" />
                {uploadProgress === 100
                  ? t('audio_uploaded_to_drive')
                  : t('audio_ready_for_drive')}
              </div>
            </div>
            {typeof uploadProgress === 'number' ? (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-dynamic-green"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            ) : null}
            {audioPreviewUrl ? (
              <audio
                aria-label={t('audio_preview')}
                className="mt-3 w-full"
                controls
                src={audioPreviewUrl}
              >
                <track kind="captions" />
              </audio>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-foreground/10 bg-background/60 p-3 text-foreground/60 text-xs leading-5">
            {t('audio_empty_state')}
          </div>
        )}

        {recordingError ? (
          <div className="rounded-md border border-dynamic-red/25 bg-dynamic-red/10 p-3 text-dynamic-red text-xs">
            {recordingError}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

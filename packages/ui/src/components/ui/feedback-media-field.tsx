'use client';

import { Upload, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn, isValidBlobUrl } from '@tuturuuu/utils/format';
import { ALLOWED_VIDEO_TYPES, MAX_FILES } from './report-problem-model';
import type { ReportProblemDialogProps } from './report-problem-model';
import type { useReportProblem } from './use-report-problem';

type ReportState = ReturnType<typeof useReportProblem>;

interface FeedbackMediaFieldProps {
  report: ReportState;
  t: ReportProblemDialogProps['t'];
  ImageComponent?: ReportProblemDialogProps['ImageComponent'];
}

export function FeedbackMediaField({
  report,
  t,
  ImageComponent,
}: FeedbackMediaFieldProps) {
  const PreviewImage = ImageComponent ?? 'img';
  const {
    formData,
    isCompressing,
    isDragOver,
    isSubmitting,
    fileInputRef,
    mediaUploadId,
    mediaPreviews,
    validationErrors,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleMediaUpload,
    removeMedia,
  } = report;

  return (
    <div className="space-y-4">
      {formData.media.length < MAX_FILES && (
        <label
          htmlFor={mediaUploadId}
          className={cn(
            'relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-ring',
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-foreground/30',
            (isCompressing || isSubmitting) && 'pointer-events-none opacity-50'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            multiple
            onChange={handleMediaUpload}
            disabled={isSubmitting || isCompressing}
            className="sr-only"
            id={mediaUploadId}
          />
          <span
            className={cn(
              'mb-3 flex size-12 items-center justify-center rounded-full',
              isDragOver
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Upload className="size-5" />
          </span>
          <span className="mb-1 font-medium text-sm">
            {isCompressing
              ? t('feedback-dialog-upload-compressing')
              : isDragOver
                ? t('feedback-dialog-upload-drop')
                : t('feedback-dialog-upload-cta')}
          </span>
          <span className="text-muted-foreground text-xs">
            {t('feedback-dialog-upload-hint')}
          </span>
        </label>
      )}

      {validationErrors.media && (
        <div className="text-dynamic-red text-sm" role="alert">
          {validationErrors.media}
        </div>
      )}

      {mediaPreviews.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {mediaPreviews.map((preview, index) => {
            const file = formData.media[index];
            const isVideo = file && ALLOWED_VIDEO_TYPES.includes(file.type);

            return (
              <li key={preview} className="relative">
                <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
                  {isVideo ? (
                    <video
                      src={isValidBlobUrl(preview) ? preview : ''}
                      className="size-full object-cover"
                      controls={false}
                      muted
                      playsInline
                    />
                  ) : (
                    <PreviewImage
                      src={
                        isValidBlobUrl(preview) ? preview : '/placeholder.svg'
                      }
                      alt={t('media-alt', { number: index + 1 })}
                      className="size-full object-cover"
                      width={100}
                      height={100}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 size-6 rounded-full shadow-lg"
                  aria-label={t('feedback-dialog-remove-media', {
                    number: index + 1,
                  })}
                  onClick={() => removeMedia(index)}
                >
                  <X className="size-3" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

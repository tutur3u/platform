import { CalendarIcon, ClockIcon, Loader2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { ExtendedTimeTrackingRequest } from '../page';
import { calculateDuration as calculateDurationUtil } from '../utils';

interface RequestViewModeProps {
  request: ExtendedTimeTrackingRequest;
  imageUrls: string[];
  isLoadingImages: boolean;
  onImageClick: (index: number) => void;
}

export function RequestViewMode({
  request,
  imageUrls,
  isLoadingImages,
  onImageClick,
}: RequestViewModeProps) {
  const t = useTranslations('time-tracker.requests');

  return (
    <>
      {/* Time Info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm font-semibold uppercase tracking-wider">
            <CalendarIcon className="h-4 w-4" />
            <span>{t('detail.startTime')}</span>
          </div>
          <p className="font-medium">
            {format(new Date(request.start_time), 'MMM d, yyyy h:mm a')}
          </p>
        </div>
        <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm font-semibold uppercase tracking-wider">
            <CalendarIcon className="h-4 w-4" />
            <span>{t('detail.endTime')}</span>
          </div>
          <p className="font-medium">
            {format(new Date(request.end_time), 'MMM d, yyyy h:mm a')}
          </p>
        </div>

        <div className="flex items-center gap-4 sm:col-span-2">
          <div className="h-px flex-1 bg-linear-to-r from-transparent via-border to-transparent" />
          <Badge
            variant="outline"
            className="border-dynamic-blue/30 bg-dynamic-blue/5 px-3 py-1 font-semibold text-dynamic-blue"
          >
            <ClockIcon className="mr-1.5 h-3.5 w-3.5" />
            {calculateDurationUtil(request.start_time, request.end_time)}
          </Badge>
          <div className="h-px flex-1 bg-linear-to-r from-transparent via-border to-transparent" />
        </div>
      </div>

      {/* Task Info */}
      {request.task ? (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
          <div className="text-muted-foreground text-sm">
            {t('detail.linkedTask')}
          </div>
          <p className="font-medium">{request.task.name}</p>
        </div>
      ) : null}

      {/* Description */}
      {request.description && (
        <div className="space-y-3">
          <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            {t('detail.description')}
          </h2>
          <div className="rounded-lg border bg-muted/10 p-4">
            <p className="whitespace-pre-wrap text-foreground text-sm leading-relaxed">
              {request.description}
            </p>
          </div>
        </div>
      )}

      {/* Attachments */}
      {request.images && request.images.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">
              {t('detail.attachments', {
                count: request.images.length,
              })}
            </h2>
          </div>
          {isLoadingImages ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/20 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                {t('detail.loadingMedia')}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {imageUrls.map((url, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onImageClick(index)}
                  className="group relative h-48 overflow-hidden rounded-lg border bg-muted/10 transition-all hover:ring-2 hover:ring-dynamic-blue/50"
                >
                  <img
                    src={url}
                    alt={`Attachment ${index + 1}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

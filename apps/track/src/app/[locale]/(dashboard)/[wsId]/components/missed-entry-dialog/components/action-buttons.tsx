import { Loader2, Plus, RefreshCw, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

interface ActionButtonsProps {
  mode: 'normal' | 'exceeded-session' | 'exceeded-session-chain';
  isLoading: boolean;
  isCreating: boolean;
  isDiscarding: boolean;
  isStartTimeOlderThanThreshold: boolean;
  isLoadingThreshold: boolean;
  hasImages: boolean;
  hasTitle: boolean;
  hasStartTime: boolean;
  hasEndTime: boolean;
  hasValidationErrors: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onDiscard?: () => void;
}

export function ActionButtons({
  mode,
  isLoading,
  isCreating,
  isDiscarding,
  isStartTimeOlderThanThreshold,
  isLoadingThreshold,
  hasImages,
  hasTitle,
  hasStartTime,
  hasEndTime,
  hasValidationErrors,
  onSubmit,
  onCancel,
  onDiscard,
}: ActionButtonsProps) {
  const t = useTranslations('time-tracker.missed_entry_dialog');
  const isExceededMode =
    mode === 'exceeded-session' || mode === 'exceeded-session-chain';

  if (isExceededMode) {
    return (
      <div className="flex flex-col gap-3 border-t px-6 pt-4 pb-6 sm:flex-row sm:justify-between">
        <Button
          variant="destructive"
          onClick={onDiscard}
          disabled={isLoading}
          className="w-full sm:w-auto"
        >
          {isDiscarding ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              {t('exceeded.discarding')}
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4" />
              {t('exceeded.discardSession')}
            </>
          )}
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {t('actions.cancel')}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isLoading || !hasImages || !hasTitle}
            className="w-full sm:w-auto"
          >
            {isCreating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {t('actions.submitting')}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                {t('actions.submitForApproval')}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Normal mode
  return (
    <div className="flex w-full flex-col-reverse gap-3 border-t px-6 pt-4 pb-6 sm:flex-row sm:justify-end">
      <Button
        variant="outline"
        onClick={onCancel}
        className="w-full sm:w-auto"
        disabled={isCreating}
      >
        {t('actions.cancel')}
      </Button>
      <Button
        onClick={onSubmit}
        aria-busy={isLoadingThreshold || undefined}
        disabled={
          isCreating ||
          isLoadingThreshold ||
          !hasTitle ||
          !hasStartTime ||
          !hasEndTime ||
          (isStartTimeOlderThanThreshold && !hasImages) ||
          hasValidationErrors
        }
        className="w-full sm:w-auto"
      >
        {isCreating ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            {isStartTimeOlderThanThreshold
              ? t('actions.submitting')
              : t('actions.adding')}
          </>
        ) : (
          <>
            {isLoadingThreshold ? (
              <Loader2
                aria-hidden="true"
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {isStartTimeOlderThanThreshold
              ? t('actions.submitForApproval')
              : t('actions.addEntry')}
            {isLoadingThreshold ? (
              <span className="sr-only">{t('actions.loading')}</span>
            ) : null}
          </>
        )}
      </Button>
    </div>
  );
}

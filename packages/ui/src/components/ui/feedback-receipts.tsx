'use client';

import { CheckCircle, MessageSquareWarning } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionMessage,
} from './custom/settings-section';
import { LoadingRegion, SkeletonList } from './skeleton';
import type {
  FeedbackReceipt,
  ReportProblemDialogProps,
} from './report-problem-model';

interface FeedbackReceiptsProps {
  receipts: FeedbackReceipt[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  t: ReportProblemDialogProps['t'];
  onSend: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
}

export function FeedbackReceipts({
  receipts,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  t,
  onSend,
  onRetry,
  onLoadMore,
}: FeedbackReceiptsProps) {
  if (isError && receipts.length === 0) {
    return (
      <SettingsSection surface="card">
        <SettingsSectionMessage
          icon={<MessageSquareWarning className="size-4 shrink-0" />}
          action={
            <Button type="button" size="sm" onClick={onRetry}>
              {t('feedback-dialog-history-retry')}
            </Button>
          }
        >
          {t('feedback-dialog-history-error')}
        </SettingsSectionMessage>
      </SettingsSection>
    );
  }

  if (isLoading) {
    return (
      <SettingsSection surface="card">
        <LoadingRegion srLabel={t('feedback-dialog-history-loading')}>
          <SkeletonList rows={3} withAvatar={false} withSubtitle />
        </LoadingRegion>
      </SettingsSection>
    );
  }

  if (receipts.length === 0) {
    return (
      <SettingsSection surface="card">
        <SettingsSectionMessage
          icon={<MessageSquareWarning className="size-4 shrink-0" />}
          action={
            <Button type="button" size="sm" onClick={onSend}>
              {t('feedback-dialog-send')}
            </Button>
          }
        >
          {t('feedback-dialog-history-empty')}
        </SettingsSectionMessage>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection surface="plain">
      <ul className="divide-y rounded-xl border bg-card">
        {receipts.map((receipt) => (
          <li
            key={receipt.id}
            className="flex items-start gap-3 px-4 py-4 md:px-5"
          >
            <CheckCircle
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-dynamic-green"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="break-words font-medium text-sm">{receipt.title}</p>
              <p className="break-all text-muted-foreground text-xs">
                {t('feedback-dialog-receipt-id', { id: receipt.id })}
              </p>
            </div>
            <time
              dateTime={receipt.createdAt}
              className="shrink-0 text-muted-foreground text-xs"
            >
              {new Date(receipt.createdAt).toLocaleString()}
            </time>
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <div className="flex justify-center pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {t('feedback-dialog-history-more')}
          </Button>
        </div>
      )}
    </SettingsSection>
  );
}

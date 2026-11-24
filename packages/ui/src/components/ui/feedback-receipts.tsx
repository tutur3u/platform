'use client';

import { getFeedbackTypeLabel } from './feedback-labels';
import { CheckCircle, MessageSquareWarning } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionMessage,
} from './custom/settings-section';
import { DEFAULT_PRODUCTS } from './report-problem-model';
import type {
  FeedbackReceipt,
  ReportProblemDialogProps,
} from './report-problem-model';

interface FeedbackReceiptsProps {
  receipts: FeedbackReceipt[];
  t: ReportProblemDialogProps['t'];
  onSend: () => void;
}

export function FeedbackReceipts({
  receipts,
  t,
  onSend,
}: FeedbackReceiptsProps) {
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
              <p className="font-medium text-sm">
                {getFeedbackTypeLabel(t, receipt.type)}
                {' · '}
                {DEFAULT_PRODUCTS.find((p) => p.value === receipt.product)
                  ?.label ?? receipt.product}
              </p>
              <p className="break-all text-muted-foreground text-xs">
                {t('feedback-dialog-receipt-id', { id: receipt.id })}
                {receipt.mediaCount > 0 &&
                  ` · ${t('feedback-dialog-receipt-media', {
                    count: receipt.mediaCount,
                  })}`}
              </p>
            </div>
            <time
              dateTime={receipt.submittedAt}
              className="shrink-0 text-muted-foreground text-xs"
            >
              {new Date(receipt.submittedAt).toLocaleString()}
            </time>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}

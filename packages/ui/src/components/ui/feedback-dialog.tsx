'use client';

import { History, Send } from '@tuturuuu/icons';
import { useCallback, useMemo, useState } from 'react';
import { FeedbackForm } from './feedback-form';
import { FeedbackReceipts } from './feedback-receipts';
import {
  SatelliteSettingsDialogShell,
  type SettingsDialogShellProps,
  type SettingsNavGroup,
} from './custom/satellite-settings-dialog-shell';
import type { ReportProblemDialogProps } from './report-problem-model';
import { useFeedbackReceipts } from './use-feedback-receipts';
import { useReportProblem } from './use-report-problem';

export const FEEDBACK_TABS = { send: 'send', history: 'history' } as const;
type FeedbackTab = (typeof FEEDBACK_TABS)[keyof typeof FEEDBACK_TABS];

const noopPersist = () => {};

type FeedbackDialogProps = Omit<
  ReportProblemDialogProps,
  'trigger' | 'showTrigger' | 'className'
> & { initialTab?: FeedbackTab };

/**
 * Feedback body for the settings dialog layout, rendered inside a Dialog: a "Send feedback" form that
 * submits through the product-feedback intake and a "Your feedback" list of the signed-in user's own receipts.
 */
export function FeedbackDialog({
  initialTab = FEEDBACK_TABS.send,
  closeOnSubmit = false,
  onSubmitted,
  ...props
}: FeedbackDialogProps) {
  const { t, products, ImageComponent } = props;
  const [tab, setTab] = useState<FeedbackTab>(initialTab);
  const receipts = useFeedbackReceipts(
    props.apiOptions,
    tab === FEEDBACK_TABS.history
  );
  const { refresh } = receipts;
  const report = useReportProblem({
    ...props,
    // Stays open on the receipt by default; a caller may still close it.
    closeOnSubmit,
    onSubmitted: (receipt) => {
      void refresh();
      setTab(FEEDBACK_TABS.history);
      onSubmitted?.(receipt);
    },
  });
  const { handleOpenChange } = report;

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) setTab(initialTab);
      handleOpenChange(open);
    },
    [handleOpenChange, initialTab]
  );

  const shellT = useCallback<SettingsDialogShellProps['t']>(
    (key, values) => {
      switch (key) {
        case 'common.close':
          return t('feedback-dialog-close');
        case 'common.no_results_found':
          return t('feedback-dialog-no-results');
        case 'common.settings':
          return t('feedback-dialog-title');
        case 'search.search':
        case 'settings.search_settings_placeholder':
          return t('feedback-dialog-search');
        case 'settings.back_to_app':
          return t('feedback-dialog-back');
        case 'settings.manage_settings':
          return String(values?.label ?? '');
        default:
          return '';
      }
    },
    [t]
  );

  const navItems = useMemo<SettingsNavGroup[]>(
    () => [
      {
        label: t('feedback-dialog-group'),
        items: [
          {
            name: FEEDBACK_TABS.send,
            label: t('feedback-dialog-send'),
            description: t('feedback-dialog-send-description'),
            icon: Send,
            keywords: [t('report-problem'), t('submit-report')],
          },
          {
            name: FEEDBACK_TABS.history,
            label: t('feedback-dialog-history'),
            description: t('feedback-dialog-history-description'),
            icon: History,
          },
        ],
      },
    ],
    [t]
  );

  return (
    <SatelliteSettingsDialogShell
      t={shellT}
      persistedTab={null}
      setPersistedTab={noopPersist}
      onboardingPanel={null}
      showOnboardingGuide={false}
      keyboardNavigation
      navItems={navItems}
      activeTab={tab}
      onActiveTabChange={(next) => setTab(next as FeedbackTab)}
    >
      {tab === FEEDBACK_TABS.history ? (
        <FeedbackReceipts
          receipts={receipts.receipts}
          isLoading={receipts.isLoading}
          isError={receipts.isError}
          hasNextPage={receipts.hasNextPage}
          isFetchingNextPage={receipts.isFetchingNextPage}
          t={t}
          onSend={() => setTab(FEEDBACK_TABS.send)}
          onRetry={() => void receipts.refetch()}
          onLoadMore={() => void receipts.fetchNextPage()}
        />
      ) : (
        <FeedbackForm
          report={report}
          t={t}
          products={products}
          ImageComponent={ImageComponent}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </SatelliteSettingsDialogShell>
  );
}

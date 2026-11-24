import type { SupportType } from '@tuturuuu/types';
import type { ReportProblemDialogProps } from './report-problem-model';

/** Localized label of a support type; types without a label show as stored. */
export function getFeedbackTypeLabel(
  t: ReportProblemDialogProps['t'],
  type: SupportType
) {
  switch (type) {
    case 'bug':
      return t('feedback-dialog-type-bug');
    case 'feature-request':
      return t('feedback-dialog-type-feature-request');
    default:
      return type;
  }
}

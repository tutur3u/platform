import { useForm, useWatch } from '@tuturuuu/ui/hooks/use-form';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '@tuturuuu/users-core/features/reports/report-limits';
import { useMemo } from 'react';
import * as z from 'zod';
import { useReportDraftSync } from './use-report-draft-sync';
import type { UserReport } from './use-report-mutations';

export const UserReportFormSchema = z.object({
  title: z.string().max(MAX_MONTHLY_REPORT_TITLE_LENGTH),
  content: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH),
  feedback: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH),
});

export function useReportReviewForm({
  wsId,
  report,
  defaultReportTitle,
  historical,
  saving,
}: {
  wsId: string;
  report: UserReport;
  defaultReportTitle: string;
  historical: boolean;
  saving: boolean;
}) {
  const saved = useMemo(
    () => ({
      title: report.title || defaultReportTitle,
      content: report.content || '',
      feedback: report.feedback || '',
    }),
    [report.title, report.content, report.feedback, defaultReportTitle]
  );
  const form = useForm({
    resolver: zodResolver(UserReportFormSchema),
    defaultValues: saved,
  });
  useReportDraftSync(
    form,
    [wsId, report.id, report.user_id, report.group_id],
    saved
  );
  const title = useWatch({ control: form.control, name: 'title' });
  const content = useWatch({ control: form.control, name: 'content' });
  const feedback = useWatch({ control: form.control, name: 'feedback' });
  const approvalBlockedReason = () => {
    if (historical) return 'approval_view_current';
    if (saving) return 'approval_wait_save';
    const current = form.getValues();
    if (
      form.formState.isDirty ||
      current.title !== saved.title ||
      current.content !== saved.content ||
      current.feedback !== saved.feedback
    ) {
      return 'approval_save_changes';
    }
    return undefined;
  };
  return { form, title, content, feedback, approvalBlockedReason };
}

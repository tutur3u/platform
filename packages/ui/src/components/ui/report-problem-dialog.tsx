'use client';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ReportProblemDialogContent } from './report-problem-dialog-content';
import type { ReportProblemDialogProps } from './report-problem-model';
export function ReportProblemDialog(
  props: Omit<ReportProblemDialogProps, 't' | 'apiOptions'>
) {
  const t = useTranslations('common');
  return <ReportProblemDialogContent {...props} t={t} ImageComponent={Image} />;
}

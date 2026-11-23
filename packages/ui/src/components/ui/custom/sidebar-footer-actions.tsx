'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { ReportProblemDialog } from '../report-problem-dialog';
import {
  SatelliteFooterActions,
  type SatelliteFooterActionsProps,
} from './satellite-footer-actions';
export function SidebarFooterActions(
  props: Omit<
    SatelliteFooterActionsProps,
    'labels' | 'discordHref' | 'onFeedback' | 'LinkComponent'
  >
) {
  const t = useTranslations('common');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const openFeedback = useCallback(() => setFeedbackOpen(true), []);
  return (
    <>
      <SatelliteFooterActions
        {...props}
        labels={{ upgrade: t('upgrade'), feedback: t('feedback') }}
        discordHref={process.env.NEXT_PUBLIC_DISCORD_LINK}
        onFeedback={openFeedback}
        LinkComponent={Link}
      />
      <ReportProblemDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        showTrigger={false}
      />
    </>
  );
}

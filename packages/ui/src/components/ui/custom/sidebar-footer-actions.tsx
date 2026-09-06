'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
  return (
    <>
      <SatelliteFooterActions
        {...props}
        labels={{ upgrade: t('upgrade'), feedback: t('feedback') }}
        discordHref={process.env.NEXT_PUBLIC_DISCORD_LINK}
        onFeedback={() => setFeedbackOpen(true)}
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

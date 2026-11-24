'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useUpgradeDialogUrlState } from '../../../hooks/use-upgrade-dialog-url-state';
import { ReportProblemDialog } from '../report-problem-dialog';
import {
  SatelliteFooterActions,
  type SatelliteFooterActionsProps,
} from './satellite-footer-actions';
import { UpgradeDialog } from './upgrade-dialog';
export function SidebarFooterActions({
  isFreeTier = true,
  ...props
}: Omit<
  SatelliteFooterActionsProps,
  'labels' | 'discordHref' | 'onFeedback' | 'LinkComponent'
> & {
  /**
   * Free workspaces see "Upgrade" on the Plans tab; paid workspaces see
   * "Current plan" on the Current plan tab of the same dialog.
   */
  isFreeTier?: boolean;
}) {
  const t = useTranslations('common');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const openFeedback = useCallback(() => setFeedbackOpen(true), []);
  const { openUpgrade } = useUpgradeDialogUrlState();
  const onUpgrade = useCallback(
    () => openUpgrade(isFreeTier ? 'plans' : 'current'),
    [isFreeTier, openUpgrade]
  );
  return (
    <>
      <SatelliteFooterActions
        {...props}
        labels={{
          upgrade: isFreeTier ? t('upgrade') : t('current_plan'),
          feedback: t('feedback'),
        }}
        discordHref={process.env.NEXT_PUBLIC_DISCORD_LINK}
        onFeedback={openFeedback}
        onUpgrade={onUpgrade}
        LinkComponent={Link}
      />
      {props.showUpgrade && (
        <UpgradeDialog
          billingFallbackHref={props.upgradeHref ?? `/${props.wsId}/billing`}
          wsId={props.wsId}
        />
      )}
      <ReportProblemDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        showTrigger={false}
      />
    </>
  );
}

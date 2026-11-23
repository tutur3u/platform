'use client';

import { useMemo } from 'react';
import { type SatelliteBrandProps, ShellAnchor } from './satellite-brand';
import { usePublishAccountHub } from './sidebar-footer-context';

export interface SatelliteFooterActionsProps {
  labels: { upgrade: string; feedback: string };
  discordHref?: string;
  onFeedback: () => void;
  LinkComponent?: SatelliteBrandProps['LinkComponent'];
  wsId: string;
  /** Unused: the actions live in the account menu in every sidebar state. */
  isCollapsed?: boolean;
  showUpgrade: boolean;
  upgradeHref?: string;
  upgradeExternal?: boolean;
}

/**
 * Publishes Upgrade, Discord and Feedback to the account menu. It renders no
 * footer controls of its own: the sidebar footer is Settings and the account.
 */
export function SatelliteFooterActions({
  labels,
  discordHref,
  onFeedback,
  LinkComponent = ShellAnchor,
  wsId,
  showUpgrade,
  upgradeHref,
  upgradeExternal = false,
}: SatelliteFooterActionsProps) {
  const upgrade = useMemo(
    () =>
      showUpgrade
        ? {
            label: labels.upgrade,
            href: upgradeHref ?? `/${wsId}/billing`,
            external: upgradeExternal,
            Link: LinkComponent,
          }
        : undefined,
    [
      LinkComponent,
      labels.upgrade,
      showUpgrade,
      upgradeExternal,
      upgradeHref,
      wsId,
    ]
  );
  const discord = useMemo(
    () => (discordHref ? { href: discordHref } : undefined),
    [discordHref]
  );
  const feedback = useMemo(
    () => ({ label: labels.feedback, open: onFeedback }),
    [labels.feedback, onFeedback]
  );

  usePublishAccountHub('upgrade', upgrade);
  usePublishAccountHub('discord', discord);
  usePublishAccountHub('feedback', feedback);
  return null;
}

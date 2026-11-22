'use client';

import { LayoutGrid } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
import { ActivityPanel, type ActivityState } from '../activity-panel';

export function LiveActivityPanelFrame({
  title,
  icon = LayoutGrid,
  subtitle,
  actions,
  state,
  fixedBody,
  onClose,
  children,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  subtitle?: ReactNode;
  /** Controls beside the close action, such as opening full screen. */
  actions?: ReactNode;
  /** Shows the shared loading, empty or error body in place of `children`. */
  state?: ActivityState;
  /** The body does not scroll; one child does, beside a footer that stays. */
  fixedBody?: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('meet.call.live_activities');
  return (
    <ActivityPanel
      title={title}
      icon={icon}
      status={subtitle}
      actions={actions}
      closeLabel={t('close')}
      onClose={() => onClose?.()}
      state={state}
      fixedBody={fixedBody}
    >
      {children}
    </ActivityPanel>
  );
}

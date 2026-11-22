'use client';

import { LayoutGrid } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
import { ResizableCallPanel } from '../../components/resizable-call-panel';
import { CallPanelHeader } from '../tool-ui';

export function LiveActivityPanelFrame({
  title,
  icon = LayoutGrid,
  subtitle,
  actions,
  onClose,
  children,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  subtitle?: ReactNode;
  /** Controls beside the close action, such as opening full screen. */
  actions?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('meet.call.live_activities');
  return (
    <ResizableCallPanel label={title}>
      <CallPanelHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        actions={actions}
        closeLabel={t('close')}
        onClose={() => onClose?.()}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {children}
      </div>
    </ResizableCallPanel>
  );
}

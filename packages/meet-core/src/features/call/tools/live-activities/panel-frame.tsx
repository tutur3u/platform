'use client';

import { LayoutGrid } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
import { ResizableCallPanel } from '../../components/resizable-call-panel';
import {
  type ActivityState,
  ActivityStateView,
} from '../../stage-layout/activity-shell';
import { CallPanelHeader } from '../tool-ui';

export function LiveActivityPanelFrame({
  title,
  icon = LayoutGrid,
  subtitle,
  actions,
  state = { kind: 'ready' },
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
      {state.kind === 'ready' ? (
        <div className="@container min-h-0 flex-1 space-y-4 overflow-y-auto p-3 @min-[360px]:p-4">
          {children}
        </div>
      ) : (
        <ActivityStateView state={state} />
      )}
    </ResizableCallPanel>
  );
}

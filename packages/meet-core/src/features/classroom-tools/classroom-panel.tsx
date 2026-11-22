'use client';

import { LayoutGrid, PenTool } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import {
  ActivityPanel,
  type ActivityState,
} from '../call/tools/activity-panel';
import { useActivityActive } from '../call/stage-layout/activity-pane-context';
import { Breakouts } from './breakouts';
import { type ClassroomTool, useClassroomTool } from './classroom-client';
import { Whiteboard } from './whiteboard';

export function ClassroomPanel({
  tool,
  meetingId,
  accountId,
  close,
}: {
  tool: ClassroomTool;
  meetingId: string;
  accountId: string;
  close: () => void;
}) {
  const t = useTranslations('meet.classroom_tools');
  const { query, action } = useClassroomTool(
    tool,
    meetingId,
    accountId,
    useActivityActive()
  );
  const label = t(`${tool}.title`);
  const state: ActivityState = query.isError
    ? {
        kind: 'error',
        title: t('unavailable'),
        onRetry: () => void query.refetch(),
      }
    : query.data
      ? { kind: 'ready' }
      : { kind: 'loading' };
  return (
    <ActivityPanel
      title={label}
      icon={tool === 'whiteboard' ? PenTool : LayoutGrid}
      closeLabel={t('close_panel')}
      onClose={close}
      state={state}
      busy={action.isPending}
    >
      {query.data &&
        ('revision' in query.data ? (
          <Whiteboard
            view={query.data}
            busy={action.isPending}
            onDraw={(item) =>
              action.mutate({ action: 'whiteboard.draw', item })
            }
            onUndo={() => action.mutate({ action: 'whiteboard.undo' })}
            onClear={() => action.mutate({ action: 'whiteboard.clear' })}
          />
        ) : (
          <Breakouts
            view={query.data}
            busy={action.isPending}
            onAction={action.mutate}
          />
        ))}
      {action.isError && (
        <p role="alert" className="text-destructive text-sm">
          {t('action_failed')}
        </p>
      )}
    </ActivityPanel>
  );
}

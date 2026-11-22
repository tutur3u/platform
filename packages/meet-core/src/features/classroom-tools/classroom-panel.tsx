'use client';

import { X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { ResizableCallPanel } from '../call/components/resizable-call-panel';
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
  return (
    <ResizableCallPanel label={label}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="font-semibold text-sm">{label}</h2>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t('close_panel')}
          title={t('close_panel')}
          onClick={close}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 overflow-y-auto p-3">
        {query.isError ? (
          <p role="alert" className="text-muted-foreground text-sm">
            {t('unavailable')}
          </p>
        ) : query.data ? (
          'revision' in query.data ? (
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
          )
        ) : (
          <p role="status" className="text-muted-foreground text-sm">
            {t('loading')}
          </p>
        )}
        {action.isError && (
          <p role="alert" className="mt-2 text-destructive text-sm">
            {t('action_failed')}
          </p>
        )}
      </div>
    </ResizableCallPanel>
  );
}

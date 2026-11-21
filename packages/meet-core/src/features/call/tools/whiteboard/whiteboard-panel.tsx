'use client';

import { Circle, PenTool, Trash2, Undo2 } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { ResizableCallPanel } from '../../components/resizable-call-panel';
import type { MeetToolPanelProps } from '../live-activities/meet-tool';
import { CallPanelHeader, ToolIconAction } from '../tool-ui';
import { type WhiteboardColor, whiteboardColors } from './stroke';
import {
  clearWhiteboard,
  readWhiteboard,
  subscribeWhiteboard,
  undoWhiteboardStroke,
} from './whiteboard-store';
import { WhiteboardSurface, whiteboardInkClass } from './whiteboard-surface';

/** A filled dot in the ink's own colour, which hover must not repaint. */
const inkIcon = (color: WhiteboardColor) =>
  function InkIcon({ className }: { className?: string }) {
    return (
      <Circle
        className={cn(className, 'fill-current', whiteboardInkClass[color])}
      />
    );
  };

const inkIcons: Record<WhiteboardColor, ReturnType<typeof inkIcon>> = {
  ink: inkIcon('ink'),
  blue: inkIcon('blue'),
  green: inkIcon('green'),
  red: inkIcon('red'),
};

export function WhiteboardPanel({
  meetingId = 'default',
  role = 'participant',
  participantId = 'guest',
  onClose,
}: MeetToolPanelProps) {
  const t = useTranslations('meet.classroom_tools');
  const { strokes } = useSyncExternalStore(
    (onStoreChange) => subscribeWhiteboard(meetingId, onStoreChange),
    () => readWhiteboard(meetingId),
    () => readWhiteboard(meetingId)
  );
  const [color, setColor] = useState<WhiteboardColor>('ink');
  const title = t('whiteboard.title');

  return (
    <ResizableCallPanel label={title}>
      <CallPanelHeader
        icon={PenTool}
        title={title}
        closeLabel={t('close_panel')}
        onClose={() => onClose?.()}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div
          role="group"
          aria-label={t('whiteboard.drawing_tools')}
          className="flex shrink-0 flex-wrap items-center justify-between gap-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            {whiteboardColors.map((id) => (
              <ToolIconAction
                key={id}
                icon={inkIcons[id]}
                label={t(`whiteboard.color_${id}`)}
                aria-pressed={color === id}
                className="aria-pressed:bg-foreground/15"
                onClick={() => setColor(id)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToolIconAction
              icon={Undo2}
              label={t('whiteboard.undo')}
              disabled={
                !strokes.some((stroke) => stroke.authorId === participantId)
              }
              onClick={() => undoWhiteboardStroke(meetingId, participantId)}
            />
            {role === 'host' ? (
              <ToolIconAction
                icon={Trash2}
                label={t('whiteboard.clear')}
                disabled={strokes.length === 0}
                onClick={() => clearWhiteboard(meetingId)}
              />
            ) : null}
          </div>
        </div>
        <WhiteboardSurface
          key={`${meetingId}:${participantId}`}
          meetingId={meetingId}
          authorId={participantId}
          color={color}
          label={title}
          strokes={strokes}
        />
      </div>
    </ResizableCallPanel>
  );
}

'use client';

import { Circle, PenTool, Trash2, Undo2 } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { useActivityActive } from '../../stage-layout/activity-pane-context';
import type { MeetToolPanelProps } from '../live-activities/meet-tool';
import { ActivityPanel } from '../activity-panel';
import { ToolIconAction } from '../tool-ui';
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
  roomRole = 'participant',
  participantId = 'guest',
  onClose,
}: MeetToolPanelProps) {
  const t = useTranslations('meet.classroom_tools');
  // A hidden pane stops redrawing from the room's strokes and catches up when
  // shown, because resubscribing reads the current strokes.
  const active = useActivityActive();
  const { strokes, canUndo, canClear } = useSyncExternalStore(
    (onStoreChange) =>
      active ? subscribeWhiteboard(meetingId, onStoreChange) : () => {},
    () => readWhiteboard(meetingId),
    () => readWhiteboard(meetingId)
  );
  const [color, setColor] = useState<WhiteboardColor>('ink');
  const title = t('whiteboard.title');
  // Its own name, so it is told apart from the classroom whiteboard in menus.
  const panelTitle = useTranslations('meet.call.live_activities')(
    'penboard.title'
  );

  return (
    <ActivityPanel
      title={panelTitle}
      icon={PenTool}
      closeLabel={t('close_panel')}
      onClose={() => onClose?.()}
    >
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
            disabled={!canUndo}
            onClick={() => undoWhiteboardStroke(meetingId, participantId)}
          />
          {/* The room decides who clears: hosts, co-hosts, participant managers. */}
          {roomRole === 'host' || canClear ? (
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
    </ActivityPanel>
  );
}

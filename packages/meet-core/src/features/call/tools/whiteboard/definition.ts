import { PenTool } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../live-activities/meet-tool';
import { WhiteboardPanel } from './whiteboard-panel';

export const whiteboardTool: MeetToolDefinition = {
  id: 'pen-whiteboard',
  label: 'meet.classroom_tools.whiteboard.title',
  icon: PenTool,
  Panel: WhiteboardPanel,
};

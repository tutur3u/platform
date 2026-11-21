import { ChartColumn } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../registry';
import { PollsToolPanel } from './polls-tool-panel';

export const pollsTool: MeetToolDefinition = {
  id: 'polls',
  label: 'meet.call.polls.title',
  icon: ChartColumn,
  Panel: PollsToolPanel,
};

import { Timer } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../registry';
import { TimerToolPanel } from './timer-tool-panel';

export const timersTool: MeetToolDefinition = {
  id: 'timers',
  label: 'meet.call.tools.timer.title',
  icon: Timer,
  Panel: TimerToolPanel,
};

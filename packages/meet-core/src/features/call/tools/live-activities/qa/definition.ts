import { MessageSquare } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../meet-tool';
import { QaPanel } from './qa-panel';

export const liveQaTool: MeetToolDefinition = {
  id: 'live-qa',
  label: 'meet.call.live_activities.qa.title',
  icon: MessageSquare,
  Panel: QaPanel,
};

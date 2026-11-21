import { MessageSquare } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../meet-tool';
import { QaPanel } from './qa-panel';

export const liveQaTool: MeetToolDefinition = {
  id: 'live-qa',
  label: 'Q&A',
  icon: MessageSquare,
  Panel: QaPanel,
};
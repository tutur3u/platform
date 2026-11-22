import { MessageCircleQuestion } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../meet-tool';
import { IcebreakerPanel } from './icebreaker-panel';

export const liveIcebreakerTool: MeetToolDefinition = {
  id: 'live-icebreaker',
  label: 'meet.call.live_activities.icebreaker.title',
  icon: MessageCircleQuestion,
  Panel: IcebreakerPanel,
};

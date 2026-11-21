import { Hand } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../meet-tool';
import { IcebreakerPanel } from './icebreaker-panel';

export const liveIcebreakerTool: MeetToolDefinition = {
  id: 'live-icebreaker',
  label: 'Icebreaker',
  icon: Hand,
  Panel: IcebreakerPanel,
};

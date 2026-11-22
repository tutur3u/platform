import { Gamepad2 } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../meet-tool';
import { GamePanel } from './game-panel';

export const liveGameTool: MeetToolDefinition = {
  id: 'live-game',
  label: 'meet.call.live_activities.game.title',
  icon: Gamepad2,
  Panel: GamePanel,
};

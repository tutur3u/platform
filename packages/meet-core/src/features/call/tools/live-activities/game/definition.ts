import { Gamepad2 } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../meet-tool';
import { GamePanel } from './game-panel';

export const liveGameTool: MeetToolDefinition = {
  id: 'live-game',
  label: 'Prep game',
  icon: Gamepad2,
  Panel: GamePanel,
};

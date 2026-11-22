import { Layers } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../meet-tool';
import { FlashcardsPanel } from './flashcards-panel';

export const liveFlashcardsTool: MeetToolDefinition = {
  id: 'live-flashcards',
  label: 'meet.call.live_activities.flashcards.title',
  icon: Layers,
  Panel: FlashcardsPanel,
};

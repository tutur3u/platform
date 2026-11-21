import { Layers } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../meet-tool';
import { FlashcardsPanel } from './flashcards-panel';

export const liveFlashcardsTool: MeetToolDefinition = {
  id: 'live-flashcards',
  label: 'Flashcards',
  icon: Layers,
  Panel: FlashcardsPanel,
};

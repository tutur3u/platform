import { Trophy } from '@tuturuuu/icons';
import type { MeetToolDefinition } from '../registry';
import { QuizToolPanel } from './quiz-tool-panel';

export const quizTool: MeetToolDefinition = {
  id: 'quiz',
  label: 'meet.call.quizArena.title',
  icon: Trophy,
  Panel: QuizToolPanel,
};

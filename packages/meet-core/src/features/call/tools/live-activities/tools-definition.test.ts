import { expect, it } from 'vitest';
import { liveAssessmentTool } from './assessment/definition';
import { liveFlashcardsTool } from './flashcards/definition';
import { liveGameTool } from './game/definition';
import { liveIcebreakerTool } from './icebreaker/definition';
import { liveQaTool } from './qa/definition';

const tools = [
  liveQaTool,
  liveAssessmentTool,
  liveFlashcardsTool,
  liveGameTool,
  liveIcebreakerTool,
];

it.each(tools.map((tool) => [tool.id, tool] as const))(
  'exports MeetToolDefinition for %s',
  (_id, tool) => {
    expect(tool.id).toBeTruthy();
    expect(tool.label).toBeTruthy();
    expect(
      typeof tool.icon === 'function' || typeof tool.icon === 'object'
    ).toBe(true);
    expect(tool.Panel).toBeTypeOf('function');
  }
);
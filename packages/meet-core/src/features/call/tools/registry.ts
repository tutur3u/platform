import type { ComponentType } from 'react';
import { liveAssessmentTool } from './live-activities/assessment/definition';
import { liveFlashcardsTool } from './live-activities/flashcards/definition';
import { liveGameTool } from './live-activities/game/definition';
import { liveIcebreakerTool } from './live-activities/icebreaker/definition';
import type { MeetToolPanelProps } from './live-activities/meet-tool';
import { liveQaTool } from './live-activities/qa/definition';
import { pollsTool } from './polls';
import { quizTool } from './quiz';
import { timersTool } from './timers';
import { whiteboardTool } from './whiteboard/definition';

/** What the hub passes every tool panel; `useMeetTool()` has the rest. */
export type { MeetToolPanelProps };

/**
 * One entry in the in-call tools hub.
 *
 * `label` is a full next-intl message key (for example
 * `meet.call.polls.title`); the hub falls back to the raw string when the key
 * is missing. `Panel` renders its own side panel and may read the call through
 * `useMeetTool()` from `./context`.
 */
export type MeetToolDefinition = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  Panel: ComponentType<MeetToolPanelProps>;
};

/** Owned by the live activities lane under `tools/live-activities`. */
export const liveActivityTools: readonly MeetToolDefinition[] = [
  liveQaTool,
  liveAssessmentTool,
  liveFlashcardsTool,
  liveGameTool,
  liveIcebreakerTool,
];

export const meetTools: readonly MeetToolDefinition[] = [
  pollsTool,
  timersTool,
  quizTool,
  ...liveActivityTools,
  whiteboardTool,
];

export function findMeetTool(
  id: string | null,
  tools: readonly MeetToolDefinition[] = meetTools
) {
  return id ? (tools.find((tool) => tool.id === id) ?? null) : null;
}

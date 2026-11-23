/**
 * EduFest 2026 workshop: data behind the interactive demos. Text lives in
 * messages/edufest-2026.{en,vi}.json; numbers here are sample data, shown
 * on the page with a "Demo data" label and never presented as measurements.
 */

/** The three views of the live-class demo. */
export const LIVE_TABS = ['ask', 'quiz', 'seats'] as const;
export type LiveTab = (typeof LIVE_TABS)[number];

/** Questions a student can ask the assistant in the demo. */
export const ASK_QUESTIONS = ['equation', 'loop'] as const;
export type AskQuestion = (typeof ASK_QUESTIONS)[number];

/** How the assistant answers: the workshop runs on hints only. */
export const ASK_MODES = ['hint', 'answer'] as const;
export type AskMode = (typeof ASK_MODES)[number];
export const WORKSHOP_ASK_MODE: AskMode = 'hint';

/** The team quiz: 2x + 6 = 14, so x = 4. */
export const QUIZ_OPTIONS = ['3', '4', '5', '10'] as const;
export type QuizOption = (typeof QUIZ_OPTIONS)[number];
export const QUIZ_ANSWER: QuizOption = '4';
/** Sample team picks shown after the reveal, one entry per option. */
export const QUIZ_TEAM_PICKS: Readonly<Record<QuizOption, number>> = {
  '3': 2,
  '4': 9,
  '5': 1,
  '10': 0,
};

/**
 * The quiz as a state machine: picking, locked in (answers hidden), then
 * revealed. A pick exists only once the learner has chosen.
 */
export type QuizState =
  | { phase: 'picking'; pick: QuizOption | null }
  | { phase: 'locked'; pick: QuizOption }
  | { phase: 'revealed'; pick: QuizOption };

export type QuizEvent =
  | { type: 'pick'; option: QuizOption }
  | { type: 'lock' }
  | { type: 'reveal' }
  | { type: 'reset' };

export const QUIZ_START: QuizState = { phase: 'picking', pick: null };

export function quizReducer(state: QuizState, event: QuizEvent): QuizState {
  switch (event.type) {
    case 'pick':
      return state.phase === 'picking'
        ? { phase: 'picking', pick: event.option }
        : state;
    case 'lock':
      return state.phase === 'picking' && state.pick
        ? { phase: 'locked', pick: state.pick }
        : state;
    case 'reveal':
      return state.phase === 'locked'
        ? { phase: 'revealed', pick: state.pick }
        : state;
    case 'reset':
      return QUIZ_START;
  }
}

/** Whether the correct answer may be shown: only after the reveal. */
export function answerVisible(state: QuizState): boolean {
  return state.phase === 'revealed';
}

/** Sample class numbers for the teacher's seat. */
export const TEACHER_VIEW = {
  joined: 38,
  seats: 40,
  hints: 64,
  stuck: ['step2', 'checking'] as const,
} as const;

/** The agent team, in the order work flows through it. */
export const AGENT_STEPS = [
  'request',
  'plan',
  'build',
  'review',
  'approve',
  'ship',
] as const;
export type AgentStep = (typeof AGENT_STEPS)[number];
/** Steps a person owns; the rest are run by AI agents. */
export const HUMAN_STEPS: readonly AgentStep[] = ['request', 'approve'];

/** The booth hall preview: a 3 x 3 grid of sample booths. */
export const BOOTHS = [
  'a1',
  'a2',
  'a3',
  'b1',
  'b2',
  'b3',
  'c1',
  'c2',
  'c3',
] as const;
export type BoothId = (typeof BOOTHS)[number];

/** One vote per visitor: choose, then cast; a cast vote is final. */
export type VoteState =
  | { phase: 'browsing'; choice: BoothId | null }
  | { phase: 'cast'; choice: BoothId };

export type VoteEvent =
  | { type: 'choose'; booth: BoothId }
  | { type: 'cast' }
  | { type: 'reset' };

export const VOTE_START: VoteState = { phase: 'browsing', choice: null };

export function voteReducer(state: VoteState, event: VoteEvent): VoteState {
  switch (event.type) {
    case 'choose':
      return state.phase === 'browsing'
        ? { phase: 'browsing', choice: event.booth }
        : state;
    case 'cast':
      return state.phase === 'browsing' && state.choice
        ? { phase: 'cast', choice: state.choice }
        : state;
    case 'reset':
      return VOTE_START;
  }
}

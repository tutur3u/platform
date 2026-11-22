import type { LiveQaQuestion, LiveQaSelf } from './qa-store';

export const LIVE_QA_SORTS = ['top', 'newest', 'answered'] as const;
export type LiveQaSort = (typeof LIVE_QA_SORTS)[number];

/**
 * Whether this connection's vote is among the question's votes. The room
 * lists a person's voted questions in its replies to them; a view that
 * carries the voters, as the host view does, answers directly.
 */
export function upvotedByMe(question: LiveQaQuestion, self: LiveQaSelf | null) {
  if (!self) return false;
  return (
    !!self.votedIds?.includes(question.id) ||
    question.upvotes.includes(self.actor)
  );
}

export const upvoteCount = (question: LiveQaQuestion) =>
  question.upvoteCount ?? question.upvotes.length;

const createdAt = (question: LiveQaQuestion) =>
  question.createdAt ? Date.parse(question.createdAt) || 0 : 0;

/**
 * The list for one tab. Top and Newest hold open questions with the pinned
 * one first; Answered holds the rest, newest first. Questions stored without
 * a time keep the room's order, which is oldest first.
 */
export function sortLiveQa(
  questions: readonly LiveQaQuestion[],
  sort: LiveQaSort,
  { includeHidden = false }: { includeHidden?: boolean } = {}
) {
  const ranked = questions
    .map((question, order) => ({ question, order }))
    .filter(
      ({ question }) =>
        (includeHidden || !question.hidden) &&
        (sort === 'answered') === question.answered
    );
  const newer = (a: (typeof ranked)[number], b: (typeof ranked)[number]) =>
    createdAt(b.question) - createdAt(a.question) || b.order - a.order;
  ranked.sort((a, b) => {
    if (sort !== 'answered') {
      const pinned = Number(!!b.question.pinned) - Number(!!a.question.pinned);
      if (pinned) return pinned;
    }
    if (sort === 'top') {
      const votes = upvoteCount(b.question) - upvoteCount(a.question);
      if (votes) return votes;
    }
    return newer(a, b);
  });
  return ranked.map(({ question }) => question);
}

/** The question for the room's screen: the pinned one, else the top open one. */
export function onScreenQuestion(questions: readonly LiveQaQuestion[]) {
  return sortLiveQa(questions, 'top')[0] ?? null;
}

export function liveQaCounts(questions: readonly LiveQaQuestion[]) {
  let open = 0;
  let answered = 0;
  let hidden = 0;
  for (const question of questions) {
    if (question.hidden) hidden++;
    else if (question.answered) answered++;
    else open++;
  }
  return { open, answered, hidden };
}

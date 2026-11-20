// Quiz answer keys live in private.workspace_quiz_answers. The public
// workspace_quizzes.content column holds only what a learner may see.
//
// Stored prompt shapes:
//   matching: { pairs: [{ left }], choices: [right, ...] } (choices shuffled)
//   ordering: { items: [...], shuffled: true } (items shuffled)
// Answer key shapes:
//   matching: { pairs: [{ left, right }] }
//   ordering: { order: [...] }
//
// Rows written before the key moved can still hold authored content
// (matching pairs with `right`, ordering items without the marker). Readers
// treat that content as a legacy key and never send it to learners.
//
// This module has no framework or runtime imports so Teach clients, Learn
// servers and tests can share it.
import type { Json } from '@tuturuuu/types';

import {
  asRecord,
  displayText,
  getArrayProperty,
  getMatchingPairs,
  getStringItems,
  type MatchingPair,
} from '../tulearn/quiz-content';

export const ORDERING_PROMPT_MARKER = 'shuffled';

type QuizKeySource = {
  answer?: unknown;
  content?: unknown;
};

type QuizPromptSource = {
  content?: unknown;
  id: string;
  type?: string | null;
};

// The rank uses only the quiz id and the value. Including the authored
// position would let anyone replay the shuffle and recover the key.
function stableRank(seed: string, value: string) {
  const input = `${seed}:${value}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Deterministic shuffle keyed by the quiz id, so a learner sees the same
 * prompt on every load. The result depends only on the set of values, never
 * on the order they were authored in.
 */
export function shuffleForPrompt(seed: string, values: string[]): string[] {
  return values
    .map((value) => ({ rank: stableRank(seed, value), value }))
    .sort((a, b) =>
      a.rank === b.rank
        ? a.value < b.value
          ? -1
          : a.value > b.value
            ? 1
            : 0
        : a.rank - b.rank
    )
    .map((entry) => entry.value);
}

/** Matching content written before keys moved: at least one pair has a right side. */
export function isAuthoredMatchingContent(content: unknown): boolean {
  return getMatchingPairs(content).length > 0;
}

/** Ordering content written before keys moved: items without the prompt marker. */
export function isAuthoredOrderingContent(content: unknown): boolean {
  const record = asRecord(content);
  if (!record || record[ORDERING_PROMPT_MARKER] === true) return false;
  return getStringItems(record, 'items').filter(Boolean).length > 0;
}

/** Matching key: the private answer first, then legacy authored content. */
export function resolveMatchingKey({
  answer,
  content,
}: QuizKeySource): MatchingPair[] {
  const keyed = getMatchingPairs(answer);
  if (keyed.length > 0) return keyed;
  return isAuthoredMatchingContent(content) ? getMatchingPairs(content) : [];
}

/** Ordering key: the private answer first, then legacy authored content. */
export function resolveOrderingKey({ answer, content }: QuizKeySource) {
  const keyed = getStringItems(answer, 'order').filter(Boolean);
  if (keyed.length > 0) return keyed;
  return isAuthoredOrderingContent(content)
    ? getStringItems(content, 'items').filter(Boolean)
    : [];
}

function matchingPrompt(quizId: string, pairs: MatchingPair[]): Json {
  return {
    choices: shuffleForPrompt(
      quizId,
      pairs.map((pair) => pair.right)
    ),
    pairs: pairs.map((pair) => ({ left: pair.left })),
  };
}

function orderingPrompt(quizId: string, items: string[]): Json {
  return {
    items: shuffleForPrompt(quizId, items),
    [ORDERING_PROMPT_MARKER]: true,
  };
}

/**
 * Split what an author submitted into stored prompt content and the private
 * answer key. Writers store `content` on workspace_quizzes and `answer` in
 * private.workspace_quiz_answers. `answer` is undefined when the author sent
 * no key and none can be derived, so callers leave the stored key unchanged.
 */
export function splitQuizAuthoring({
  answer,
  content,
  quizId,
  type,
}: {
  answer?: Json;
  content?: Json;
  quizId: string;
  type?: string | null;
}): { answer: Json | undefined; content: Json | undefined } {
  if (type === 'matching') {
    const pairs = resolveMatchingKey({ answer, content });
    if (pairs.length === 0) return { answer, content };
    return {
      answer: { pairs: pairs.map(({ left, right }) => ({ left, right })) },
      content: matchingPrompt(quizId, pairs),
    };
  }

  if (type === 'ordering') {
    const order = resolveOrderingKey({ answer, content });
    if (order.length === 0) return { answer, content };
    return {
      answer: { order },
      content: orderingPrompt(quizId, order),
    };
  }

  return { answer, content };
}

function promptLefts(content: unknown) {
  return getArrayProperty(
    Array.isArray(content) ? { pairs: content } : content,
    'pairs'
  )
    .map((pair) => displayText(asRecord(pair)?.left))
    .filter(Boolean);
}

/**
 * The one learner-facing projection of quiz content. Each type has an
 * allowlist; anything else in content is dropped.
 */
export function projectLearnerQuizPrompt(quiz: QuizPromptSource): Json {
  const content = quiz.content;

  if (!quiz.type || quiz.type === 'multiple_choice') {
    const options = getStringItems(content, 'options').filter(Boolean);
    return options.length > 0 ? { options } : {};
  }

  if (quiz.type === 'matching') {
    const lefts = promptLefts(content);
    const storedChoices = getStringItems(content, 'choices').filter(Boolean);
    // Stored prompts are already shuffled. Legacy authored pairs are not.
    const choices =
      storedChoices.length > 0
        ? storedChoices
        : shuffleForPrompt(
            quiz.id,
            getMatchingPairs(content).map((pair) => pair.right)
          );
    return { choices, pairs: lefts.map((left) => ({ left })) };
  }

  if (quiz.type === 'ordering') {
    const items = getStringItems(content, 'items').filter(Boolean);
    return {
      items: isAuthoredOrderingContent(content)
        ? shuffleForPrompt(quiz.id, items)
        : items,
    };
  }

  return {};
}

/** Authored matching pairs for Teach editors and previews. */
export function authoredMatchingPairs(quiz: QuizKeySource): MatchingPair[] {
  return resolveMatchingKey(quiz);
}

/** Authored ordering sequence for Teach editors and previews. */
export function authoredOrderingItems(quiz: QuizKeySource): string[] {
  return resolveOrderingKey(quiz);
}

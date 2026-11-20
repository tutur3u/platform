import { describe, expect, it } from 'vitest';
import {
  authoredMatchingPairs,
  authoredOrderingItems,
  projectLearnerQuizPrompt,
  resolveMatchingKey,
  resolveOrderingKey,
  shuffleForPrompt,
  splitQuizAuthoring,
} from './quiz-answer-key';

const pairs = [
  { left: 'Cat', right: 'Meo' },
  { left: 'Dog', right: 'Gau' },
  { left: 'Cow', right: 'Bo' },
];
const order = ['one', 'two', 'three', 'four'];

function hasRightSide(value: unknown) {
  return JSON.stringify(value).includes('"right"');
}

describe('shuffleForPrompt', () => {
  it('depends only on the set of values, not their authored order', () => {
    expect(shuffleForPrompt('quiz', ['a', 'b', 'c', 'd'])).toEqual(
      shuffleForPrompt('quiz', ['d', 'b', 'a', 'c'])
    );
  });

  it('keeps every value', () => {
    expect([...shuffleForPrompt('quiz', order)].sort()).toEqual(
      [...order].sort()
    );
  });
});

describe('splitQuizAuthoring', () => {
  it('moves matching pairs to the answer and keeps a left-side prompt', () => {
    const split = splitQuizAuthoring({
      answer: undefined,
      content: { pairs },
      quizId: 'quiz-1',
      type: 'matching',
    });

    expect(split.answer).toEqual({ pairs });
    expect(hasRightSide(split.content)).toBe(false);
    expect(split.content).toMatchObject({
      pairs: [{ left: 'Cat' }, { left: 'Dog' }, { left: 'Cow' }],
    });
    expect(
      [...((split.content as { choices: string[] }).choices ?? [])].sort()
    ).toEqual(['Bo', 'Gau', 'Meo']);
  });

  it('builds the matching prompt from the answer when content is empty', () => {
    const split = splitQuizAuthoring({
      answer: { pairs },
      content: {},
      quizId: 'quiz-1',
      type: 'matching',
    });

    expect(split.answer).toEqual({ pairs });
    expect(hasRightSide(split.content)).toBe(false);
  });

  it('moves the ordering sequence to the answer and marks a shuffled prompt', () => {
    const split = splitQuizAuthoring({
      answer: { order },
      content: {},
      quizId: 'quiz-2',
      type: 'ordering',
    });

    expect(split.answer).toEqual({ order });
    expect(split.content).toMatchObject({ shuffled: true });
    expect(
      [...((split.content as { items: string[] }).items ?? [])].sort()
    ).toEqual([...order].sort());
  });

  it('leaves other quiz types unchanged', () => {
    expect(
      splitQuizAuthoring({
        answer: { correctIndex: 1 },
        content: { options: ['a', 'b'] },
        quizId: 'quiz-3',
        type: 'multiple_choice',
      })
    ).toEqual({
      answer: { correctIndex: 1 },
      content: { options: ['a', 'b'] },
    });
  });

  it('leaves the stored key alone when the author sends none', () => {
    expect(splitQuizAuthoring({ quizId: 'quiz-4', type: 'ordering' })).toEqual({
      answer: undefined,
      content: undefined,
    });
  });
});

describe('projectLearnerQuizPrompt', () => {
  it('never sends matching right sides as pairs from legacy content', () => {
    const prompt = projectLearnerQuizPrompt({
      content: { pairs },
      id: 'quiz-1',
      type: 'matching',
    });

    expect(hasRightSide(prompt)).toBe(false);
    expect(prompt).toMatchObject({
      pairs: [{ left: 'Cat' }, { left: 'Dog' }, { left: 'Cow' }],
    });
  });

  it('reshuffles a marked ordering so an authored order cannot pass through', () => {
    const marked = projectLearnerQuizPrompt({
      content: { items: order, shuffled: true },
      id: 'quiz-2',
      type: 'ordering',
    });

    expect(marked).toEqual({ items: shuffleForPrompt('quiz-2', order) });
    expect(
      projectLearnerQuizPrompt({
        content: marked,
        id: 'quiz-2',
        type: 'ordering',
      })
    ).toEqual(marked);
  });

  it('shuffles legacy ordering content independent of the authored order', () => {
    const legacy = projectLearnerQuizPrompt({
      content: { items: order },
      id: 'quiz-2',
      type: 'ordering',
    });
    const reordered = projectLearnerQuizPrompt({
      content: { items: [...order].reverse() },
      id: 'quiz-2',
      type: 'ordering',
    });

    expect(legacy).toEqual(reordered);
  });

  it('drops anything outside the per-type allowlist', () => {
    expect(
      projectLearnerQuizPrompt({
        content: { correct: true, rubric: 'secret' },
        id: 'quiz-5',
        type: 'true_false',
      })
    ).toEqual({});
    expect(
      projectLearnerQuizPrompt({
        content: { options: ['a', 'b'], correctIndex: 0 },
        id: 'quiz-6',
        type: 'multiple_choice',
      })
    ).toEqual({ options: ['a', 'b'] });
    expect(
      projectLearnerQuizPrompt({
        content: { modelAnswer: 'secret' },
        id: 'quiz-7',
        type: 'paragraph',
      })
    ).toEqual({});
  });
});

describe('answer keys', () => {
  it('grades from the private answer first', () => {
    expect(
      resolveOrderingKey({
        answer: { order: ['b', 'a'] },
        content: { items: ['a', 'b'] },
      })
    ).toEqual(['b', 'a']);
    expect(
      resolveMatchingKey({ answer: { pairs }, content: { pairs: [] } })
    ).toEqual(pairs);
  });

  it('falls back only to legacy authored content, never to a prompt', () => {
    expect(resolveOrderingKey({ content: { items: ['a', 'b'] } })).toEqual([
      'a',
      'b',
    ]);
    expect(
      resolveOrderingKey({ content: { items: ['b', 'a'], shuffled: true } })
    ).toEqual([]);
    expect(
      resolveMatchingKey({
        content: { pairs: [{ left: 'Cat' }], choices: ['Meo'] },
      })
    ).toEqual([]);
  });

  it('gives Teach editors the authored key', () => {
    expect(authoredMatchingPairs({ answer: { pairs } })).toEqual(pairs);
    expect(authoredOrderingItems({ answer: { order } })).toEqual(order);
  });
});

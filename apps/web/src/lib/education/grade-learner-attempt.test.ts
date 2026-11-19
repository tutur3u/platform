import { describe, expect, it } from 'vitest';
import {
  QuizGradeError,
  completedModuleIds,
  gradeLearnerAttempt,
} from './grade-learner-attempt';

const quiz = { id: 'quiz-1', score: 2 };
const other = { id: 'quiz-2', score: 5 };

describe('gradeLearnerAttempt', () => {
  it('scores the stored option and ignores anything the client claims', () => {
    const graded = gradeLearnerAttempt({
      quizzes: [quiz, other],
      options: [
        { id: 'right', quizId: 'quiz-1', isCorrect: true, points: 4 },
        { id: 'wrong', quizId: 'quiz-2', isCorrect: false, points: 9 },
      ],
      answers: [
        { quizId: 'quiz-1', selectedOptionId: 'right' },
        { quizId: 'quiz-2', selectedOptionId: 'wrong' },
      ],
    });

    expect(graded).toEqual({
      answers: [
        {
          quizId: 'quiz-1',
          selectedOptionId: 'right',
          isCorrect: true,
          scoreAwarded: 4,
        },
        {
          quizId: 'quiz-2',
          selectedOptionId: 'wrong',
          isCorrect: false,
          scoreAwarded: 0,
        },
      ],
      correctCount: 1,
      questionCount: 2,
      totalScore: 4,
    });
  });

  it('uses the quiz score when a correct option has no points', () => {
    const graded = gradeLearnerAttempt({
      quizzes: [quiz],
      options: [
        { id: 'right', quizId: 'quiz-1', isCorrect: true, points: null },
      ],
      answers: [{ quizId: 'quiz-1', selectedOptionId: 'right' }],
    });
    expect(graded.answers[0]?.scoreAwarded).toBe(2);
  });

  it('rejects a quiz or option that is not in the workspace set', () => {
    expect(() =>
      gradeLearnerAttempt({
        quizzes: [quiz],
        options: [
          { id: 'right', quizId: 'quiz-1', isCorrect: true, points: 1 },
        ],
        answers: [{ quizId: 'other', selectedOptionId: 'right' }],
      })
    ).toThrow(QuizGradeError);

    expect(() =>
      gradeLearnerAttempt({
        quizzes: [quiz],
        options: [
          { id: 'right', quizId: 'quiz-1', isCorrect: true, points: 1 },
        ],
        answers: [{ quizId: 'quiz-1', selectedOptionId: 'foreign' }],
      })
    ).toThrow(QuizGradeError);
  });

  it('rejects a duplicate answer for one quiz', () => {
    expect(() =>
      gradeLearnerAttempt({
        quizzes: [quiz],
        options: [
          { id: 'right', quizId: 'quiz-1', isCorrect: true, points: 1 },
        ],
        answers: [
          { quizId: 'quiz-1', selectedOptionId: 'right' },
          { quizId: 'quiz-1', selectedOptionId: 'right' },
        ],
      })
    ).toThrow(QuizGradeError);
  });
});

describe('completedModuleIds', () => {
  it('completes a module only when every linked quiz is correct', () => {
    const modules = [
      { id: 'done', quizIds: ['quiz-1'] },
      { id: 'partial', quizIds: ['quiz-1', 'quiz-2'] },
      { id: 'empty', quizIds: [] },
    ];
    expect(
      completedModuleIds({
        modules,
        graded: [
          { quizId: 'quiz-1', isCorrect: true },
          { quizId: 'quiz-2', isCorrect: false },
        ],
      })
    ).toEqual(['done']);
  });
});

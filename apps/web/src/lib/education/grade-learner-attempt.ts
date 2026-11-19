export class QuizGradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuizGradeError';
  }
}

export interface StoredQuiz {
  id: string;
  score: number;
}

export interface StoredOption {
  id: string;
  quizId: string;
  isCorrect: boolean;
  points: number | null;
}

export interface SubmittedAnswer {
  quizId: string;
  selectedOptionId: string;
}

export interface GradedAnswer {
  quizId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  scoreAwarded: number;
}

export interface GradedAttempt {
  answers: GradedAnswer[];
  correctCount: number;
  questionCount: number;
  totalScore: number;
}

/**
 * Grades a practice attempt from stored options. The client never supplies
 * correctness or points.
 */
export function gradeLearnerAttempt(input: {
  quizzes: StoredQuiz[];
  options: StoredOption[];
  answers: SubmittedAnswer[];
}): GradedAttempt {
  if (input.answers.length === 0) {
    throw new QuizGradeError('At least one answer is required');
  }

  const seen = new Set<string>();
  for (const answer of input.answers) {
    if (seen.has(answer.quizId)) {
      throw new QuizGradeError('Duplicate quiz answer');
    }
    seen.add(answer.quizId);
  }

  const quizzes = new Map(input.quizzes.map((quiz) => [quiz.id, quiz]));
  const options = new Map(
    input.options.map((option) => [`${option.quizId}:${option.id}`, option])
  );
  const graded: GradedAnswer[] = [];

  for (const answer of input.answers) {
    const quiz = quizzes.get(answer.quizId);
    if (!quiz) {
      throw new QuizGradeError('Quiz is outside this workspace');
    }
    const option = options.get(`${answer.quizId}:${answer.selectedOptionId}`);
    if (!option) {
      throw new QuizGradeError('Option does not belong to the quiz');
    }
    graded.push({
      quizId: answer.quizId,
      selectedOptionId: answer.selectedOptionId,
      isCorrect: option.isCorrect,
      scoreAwarded: option.isCorrect ? (option.points ?? quiz.score ?? 0) : 0,
    });
  }

  return {
    answers: graded,
    correctCount: graded.filter((answer) => answer.isCorrect).length,
    questionCount: graded.length,
    totalScore: graded.reduce((sum, answer) => sum + answer.scoreAwarded, 0),
  };
}

export interface CourseModuleQuizzes {
  id: string;
  quizIds: string[];
}

/**
 * A module is complete only when this attempt answered every linked quiz
 * correctly. Modules with no linked quizzes stay incomplete.
 */
export function completedModuleIds(input: {
  modules: CourseModuleQuizzes[];
  graded: Pick<GradedAnswer, 'quizId' | 'isCorrect'>[];
}): string[] {
  const correct = new Set(
    input.graded
      .filter((answer) => answer.isCorrect)
      .map((answer) => answer.quizId)
  );
  return input.modules
    .filter(
      (module) =>
        module.quizIds.length > 0 &&
        module.quizIds.every((quizId) => correct.has(quizId))
    )
    .map((module) => module.id);
}

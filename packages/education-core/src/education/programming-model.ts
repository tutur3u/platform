import type {
  ProgrammingAuthorProblem,
  ProgrammingCase,
  ProgrammingProblem,
  ProgrammingProblemSummary,
  ProgrammingText,
} from '@tuturuuu/types/primitives/programming';
import { PROGRAMMING_CATALOG_CASE_LIMIT } from '@tuturuuu/types/primitives/programming';

/** Private storage shapes pending admitted schema application/type generation. */
export interface ProgrammingProblemRow {
  id: string;
  ws_id: string | null;
  slug: string;
  title: ProgrammingText;
  prompt: ProgrammingText;
  difficulty: ProgrammingProblemSummary['difficulty'];
  topic: ProgrammingProblemSummary['topic'];
  starter_code: string;
  status: ProgrammingProblemSummary['status'];
  revision: number;
}

export interface ProgrammingCaseRow extends ProgrammingCase {
  problem_id: string;
  position: number;
}

export class ProgrammingError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 500
  ) {
    super(message);
    this.name = 'ProgrammingError';
  }
}

export function publicProgrammingProblem(
  problem: ProgrammingProblemRow,
  cases: ProgrammingCaseRow[],
  canAuthor: boolean
): ProgrammingProblem {
  if (cases.length > PROGRAMMING_CATALOG_CASE_LIMIT)
    throw new ProgrammingError('Problem cases exceed the judge limit', 500);
  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    prompt: problem.prompt,
    difficulty: problem.difficulty,
    topic: problem.topic,
    starterCode: problem.starter_code,
    status: problem.status,
    revision: problem.revision,
    editable: canAuthor && problem.ws_id !== null,
    publicCases: cases
      .filter((entry) => entry.visible)
      .map((entry) => ({
        input: entry.input,
        output: entry.expected,
      })),
  };
}

export function authorProgrammingProblem(
  problem: ProgrammingProblemRow,
  cases: ProgrammingCaseRow[]
): ProgrammingAuthorProblem {
  return {
    ...publicProgrammingProblem(problem, cases, true),
    // Workspace authors may not inspect the platform catalog's hidden answers.
    cases: cases
      .filter((entry) => problem.ws_id !== null || entry.visible)
      .map(({ input, expected, visible }) => ({ input, expected, visible })),
  };
}

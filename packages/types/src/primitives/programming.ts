/** Compatibility with the existing Judge parser: ten command cases. Authoring
 * reserves one slot for the learner's optional custom test; runner limits stay unchanged. */
export const PROGRAMMING_COMMAND_CASE_LIMIT = 10;
export const PROGRAMMING_CATALOG_PAGE_SIZE = 50;
export const PROGRAMMING_CATALOG_CASE_LIMIT =
  PROGRAMMING_COMMAND_CASE_LIMIT - 1;

export type ProgrammingLocale = 'en' | 'vi';
export type ProgrammingText = Record<ProgrammingLocale, string>;
export type ProgrammingStatus = 'draft' | 'published' | 'archived';

export interface ProgrammingProblemSummary {
  id: string;
  slug: string;
  title: ProgrammingText;
  difficulty: 'easy' | 'medium';
  topic: 'arrays' | 'search' | 'stacks';
  revision: number;
  status: ProgrammingStatus;
  /** Platform catalog entries are visible to authorized learners, never editable. */
  editable: boolean;
}

/** An explicit public DTO. Hidden case inputs/answers never belong here. */
export interface ProgrammingProblem extends ProgrammingProblemSummary {
  prompt: ProgrammingText;
  starterCode: string;
  publicCases: { input: string; output: string }[];
}

export interface ProgrammingCase {
  input: string;
  expected: string;
  visible: boolean;
}

/** Returned only after author membership and manage_users checks. */
export interface ProgrammingAuthorProblem extends ProgrammingProblem {
  cases: ProgrammingCase[];
}

export interface ProgrammingProblemInput {
  slug: string;
  title: ProgrammingText;
  prompt: ProgrammingText;
  difficulty: ProgrammingProblemSummary['difficulty'];
  topic: ProgrammingProblemSummary['topic'];
  starterCode: string;
  status: ProgrammingStatus;
  cases: ProgrammingCase[];
}

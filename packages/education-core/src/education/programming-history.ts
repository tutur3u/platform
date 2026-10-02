/** Persisted binding survives ON DELETE SET NULL, preventing legacy fallback. */
export interface ProgrammingSubmissionBinding {
  ws_id: string;
  user_id: string;
  problem_id: string | null;
  problem_bound: boolean;
  challenge_slug: string;
}

export function matchesProgrammingHistory(
  submission: ProgrammingSubmissionBinding,
  scope: {
    wsId: string;
    learnerId: string;
    problemId: string;
    /** Trusted audited server mapping; never derive from request slug. */
    importedGlobalSlug?: string;
  }
) {
  if (submission.ws_id !== scope.wsId || submission.user_id !== scope.learnerId)
    return false;
  if (submission.problem_id !== null) {
    return (
      submission.problem_bound && submission.problem_id === scope.problemId
    );
  }
  return (
    !submission.problem_bound &&
    scope.importedGlobalSlug !== undefined &&
    submission.challenge_slug === scope.importedGlobalSlug
  );
}

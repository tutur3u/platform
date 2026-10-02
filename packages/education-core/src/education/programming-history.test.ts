import { describe, expect, it } from 'vitest';
import { matchesProgrammingHistory } from './programming-history';

const scope = {
  wsId: 'workspace-a',
  learnerId: 'learner-a',
  problemId: 'problem-a',
};
const submission = {
  ws_id: scope.wsId,
  user_id: scope.learnerId,
  problem_id: scope.problemId,
  problem_bound: true,
  challenge_slug: 'synthetic',
};

describe('Programming history binding for listing and polling', () => {
  it('requires learner, workspace and opaque problem identity', () => {
    expect(matchesProgrammingHistory(submission, scope)).toBe(true);
    for (const changed of [
      { ws_id: 'foreign' },
      { user_id: 'foreign' },
      { problem_id: 'foreign' },
      { problem_bound: false },
    ]) {
      expect(
        matchesProgrammingHistory({ ...submission, ...changed }, scope)
      ).toBe(false);
    }
  });
  it('requires an audited global mapping for never-bound legacy records', () => {
    const legacy = { ...submission, problem_id: null, problem_bound: false };
    expect(matchesProgrammingHistory(legacy, scope)).toBe(false);
    expect(
      matchesProgrammingHistory(legacy, {
        ...scope,
        importedGlobalSlug: 'synthetic',
      })
    ).toBe(true);
    expect(
      matchesProgrammingHistory(legacy, {
        ...scope,
        importedGlobalSlug: 'other',
      })
    ).toBe(false);
  });
  it('does not reclassify formerly bound submissions after problem deletion', () => {
    expect(
      matchesProgrammingHistory(
        { ...submission, problem_id: null },
        { ...scope, importedGlobalSlug: 'synthetic' }
      )
    ).toBe(false);
  });
});

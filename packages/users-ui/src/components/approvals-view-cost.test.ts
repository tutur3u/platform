import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/approvals-view.tsx', 'utf8');

describe('approval filter directory cost contract', () => {
  it('shares one bounded user query across recipient and creator filters', () => {
    expect(source.match(/listWorkspaceBasicUsers\(wsId/g)).toHaveLength(1);
    expect(source).toContain(
      "queryKey: ['ws', wsId, 'approvals', 'filter-users']"
    );
    expect(source).toContain('listWorkspaceBasicUsers(wsId, { limit: 200 })');
    expect(source).toContain(')).data');
    expect(source.match(/filterUsersQuery\.data/g)).toHaveLength(2);
    expect(source).not.toContain('users?limit=500');
    expect(source).not.toContain("'filter-creators'");
  });
});

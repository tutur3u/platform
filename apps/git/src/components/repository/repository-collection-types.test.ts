import { describe, expect, it } from 'vitest';
import type { GitHubCommit } from '@/lib/github/types';
import { toCollectionRow } from './repository-collection-types';

describe('toCollectionRow', () => {
  it('creates a compact searchable commit view model', () => {
    const commit = {
      author: {
        avatar_url: 'https://avatars.githubusercontent.com/u/1',
        html_url: 'https://github.com/example',
        login: 'example',
      },
      commit: {
        author: {
          date: '2026-07-28T07:00:00Z',
          email: 'example@example.com',
          name: 'Example User',
        },
        message: 'Improve the commit browser\n\nA long body is not rendered.',
      },
      html_url: 'https://github.com/tutur3u/platform/commit/abcdef123456',
      sha: 'abcdef123456',
    } satisfies GitHubCommit;

    const row = toCollectionRow(commitItem(commit), 'tutur3u', 'platform');

    expect(row).toMatchObject({
      href: '/tutur3u/platform/commit/abcdef123456',
      key: 'commit-abcdef123456',
      kind: 'commit',
      title: 'Improve the commit browser',
      trailing: 'abcdef1',
    });
    expect(row.search).toContain('improve the commit browser');
    expect(row.search).toContain('example user');
    expect(row.search).not.toContain('avatars.githubusercontent.com');
    expect(row).not.toHaveProperty('item');
  });
});

function commitItem(value: GitHubCommit) {
  return { kind: 'commit' as const, value };
}

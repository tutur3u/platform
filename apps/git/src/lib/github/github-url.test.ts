import { describe, expect, it } from 'vitest';
import { buildGitHubUrl } from './github-url';
import type { GitRepository } from './types';

const repository: GitRepository = {
  archived: false,
  defaultBranch: 'main',
  description: null,
  enabled: true,
  githubRepositoryId: 536896722,
  homepageUrl: null,
  id: 'bootstrap-tutur3u-platform',
  name: 'platform',
  owner: 'tutur3u',
  visibility: 'public',
};

describe('buildGitHubUrl', () => {
  it('does not add a trailing slash for repository metadata', () => {
    expect(buildGitHubUrl(repository, '').toString()).toBe(
      'https://api.github.com/repos/tutur3u/platform'
    );
  });

  it('normalizes resource paths and query parameters', () => {
    expect(
      buildGitHubUrl(repository, 'commits', {
        page: 2,
        per_page: 50,
        ref: undefined,
      }).toString()
    ).toBe(
      'https://api.github.com/repos/tutur3u/platform/commits?page=2&per_page=50'
    );
  });
});

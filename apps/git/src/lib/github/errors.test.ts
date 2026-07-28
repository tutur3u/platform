import { describe, expect, it } from 'vitest';
import { classifyGitHubResponseError } from './errors';

describe('classifyGitHubResponseError', () => {
  it('identifies an exhausted GitHub rate limit from response headers', () => {
    expect(
      classifyGitHubResponseError({
        rateLimitRemaining: '0',
        status: 403,
      })
    ).toMatchObject({
      code: 'github_rate_limited',
      status: 503,
    });
  });

  it('does not label every GitHub 403 as rate limiting', () => {
    expect(
      classifyGitHubResponseError({
        message: 'Resource not accessible by integration',
        rateLimitRemaining: '4999',
        status: 403,
      })
    ).toMatchObject({
      code: 'github_access_denied',
      status: 502,
    });
  });

  it('identifies secondary rate limits from GitHub messages', () => {
    expect(
      classifyGitHubResponseError({
        message: 'You have exceeded a secondary rate limit.',
        status: 403,
      })
    ).toMatchObject({
      code: 'github_rate_limited',
    });
  });
});

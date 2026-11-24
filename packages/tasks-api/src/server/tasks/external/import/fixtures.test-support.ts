import { normalizedIssueSchema, type NormalizedIssue } from '../schemas';

export function issue(
  overrides: Partial<NormalizedIssue> & { number: number }
): NormalizedIssue {
  return normalizedIssueSchema.parse({
    url: `https://github.com/tutur3u/platform/issues/${overrides.number}`,
    repo: 'tutur3u/platform',
    title: `Issue ${overrides.number}`,
    body: 'Some **markdown** body',
    state: 'open',
    created_at: '2023-05-01T07:00:00Z',
    ...overrides,
  });
}

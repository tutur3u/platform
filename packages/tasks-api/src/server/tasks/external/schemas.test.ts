import { describe, expect, it } from 'vitest';
import { normalizedIssueSchema } from './schemas';

const base = {
  url: 'https://github.com/tutur3u/platform/issues/7',
  repo: 'tutur3u/platform',
  number: 7,
  title: 'Issue',
  state: 'open',
  created_at: '2023-05-01T07:00:00Z',
};

const parse = (over: Record<string, unknown>) =>
  normalizedIssueSchema.safeParse({ ...base, ...over });

describe('imported issue URL ownership', () => {
  it('accepts GitHub issue, comment, pull request and commit URLs', () => {
    const result = parse({
      comments: [
        {
          url: `${base.url}#issuecomment-123`,
          body: 'hi',
          created_at: base.created_at,
        },
      ],
      linked_prs: [{ url: 'https://github.com/other/repo/pull/9' }],
      linked_commits: [
        { url: 'https://github.com/other/repo/commit/ABCDEF1234567' },
      ],
      parent_url: 'https://github.com/other/repo/issues/1',
      sub_issue_urls: ['https://github.com/tutur3u/platform/issues/8'],
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['another host', 'https://evil.example/tutur3u/platform/issues/7'],
    [
      'a look-alike host',
      'https://github.com.evil.example/tutur3u/platform/issues/7',
    ],
    ['a subdomain', 'https://gist.github.com/tutur3u/platform/issues/7'],
    ['a pull request path', 'https://github.com/tutur3u/platform/pull/7'],
    ['a query string', 'https://github.com/tutur3u/platform/issues/7?x=1'],
    ['plain http', 'http://github.com/tutur3u/platform/issues/7'],
    ['userinfo', 'https://user@github.com/tutur3u/platform/issues/7'],
  ])('rejects an issue url on %s', (_name, url) => {
    expect(parse({ url }).success).toBe(false);
  });

  it('requires the issue URL to match the declared repo and number', () => {
    expect(
      parse({ url: 'https://github.com/someone/else/issues/7' }).success
    ).toBe(false);
    expect(
      parse({ url: 'https://github.com/tutur3u/platform/issues/8' }).success
    ).toBe(false);
    expect(
      parse({ url: 'https://github.com/TUTUR3U/Platform/issues/7' }).success
    ).toBe(true);
  });

  it('rejects comment URLs that are not comments on this issue', () => {
    const comment = (url: string) => ({
      comments: [{ url, body: 'x', created_at: base.created_at }],
    });
    expect(parse(comment(`${base.url}#c1`)).success).toBe(false);
    expect(
      parse(
        comment('https://github.com/tutur3u/platform/issues/8#issuecomment-1')
      ).success
    ).toBe(false);
    expect(
      parse(comment('https://github.com/other/repo/issues/7#issuecomment-1'))
        .success
    ).toBe(false);
    expect(parse(comment('https://example.com/a#issuecomment-1')).success).toBe(
      false
    );
  });

  it('rejects link and relationship URLs of the wrong shape', () => {
    expect(
      parse({ linked_prs: [{ url: 'https://github.com/o/r/issues/9' }] })
        .success
    ).toBe(false);
    expect(
      parse({ linked_prs: [{ url: 'https://example.com/o/r/pull/9' }] }).success
    ).toBe(false);
    expect(
      parse({
        linked_commits: [{ url: 'https://github.com/o/r/commit/not-a-sha' }],
      }).success
    ).toBe(false);
    expect(
      parse({ linked_commits: [{ url: 'https://github.com/o/r/pull/9' }] })
        .success
    ).toBe(false);
    expect(parse({ parent_url: 'https://github.com/o/r/pull/9' }).success).toBe(
      false
    );
    expect(
      parse({ sub_issue_urls: ['https://example.com/o/r/issues/9'] }).success
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  defaultGitGuardConfig,
  globMatch,
  normalizeGitGuardConfig,
  repoSlugFromRemote,
} from './git-guard-config';
import { classifyGh } from './git-guard-gh';
import {
  evaluatePush,
  type PushUpdate,
  refusalMessage,
} from './git-guard-policy';

const Z = '0'.repeat(40);
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const config = { ...defaultGitGuardConfig('test-box') };
const ancestor = (older: string, newer: string) => older === A && newer === B;
const update = (
  remoteRef: string,
  localSha: string,
  remoteSha: string
): PushUpdate => ({ localRef: 'refs/heads/x', localSha, remoteRef, remoteSha });
const decide = (u: PushUpdate, overrides = {}) =>
  evaluatePush({ ...config, ...overrides }, [u], ancestor)[0]!;

describe('repoSlugFromRemote', () => {
  it.each([
    ['https://github.com/tutur3u/platform.git', 'tutur3u/platform'],
    ['https://github.com/Tutur3u/Platform', 'tutur3u/platform'],
    ['git@github.com:upskii/platform.git', 'upskii/platform'],
    ['ssh://git@github.com/tutur3u/platform.git/', 'tutur3u/platform'],
    [
      'https://x-access-token:secret@github.com/tutur3u/platform.git',
      'tutur3u/platform',
    ],
    ['/srv/mirrors/tutur3u/platform.git', 'tutur3u/platform'],
    ['tutur3u/platform', 'tutur3u/platform'],
  ])('%s -> %s', (url, slug) => {
    expect(repoSlugFromRemote(url)).toBe(slug);
  });

  it('never returns credentials and rejects bare names', () => {
    expect(
      repoSlugFromRemote('https://user:secret@github.com/tutur3u/platform')
    ).not.toContain('secret');
    expect(repoSlugFromRemote('origin')).toBeNull();
    expect(repoSlugFromRemote(undefined)).toBeNull();
  });
});

describe('config', () => {
  it('treats a missing or malformed config as disabled', () => {
    expect(normalizeGitGuardConfig(null).enabled).toBe(false);
    expect(normalizeGitGuardConfig({ enabled: 'yes' }).enabled).toBe(false);
  });

  it('defaults to both platform repos with existing branches refused', () => {
    const value = normalizeGitGuardConfig({ enabled: true });
    expect(value.repos).toEqual(['tutur3u/platform', 'upskii/platform']);
    expect(value.existingBranches).toBe('refuse');
  });

  it('matches allowlist globs exactly', () => {
    expect(globMatch('hotfix/*', 'hotfix/a/b')).toBe(true);
    expect(globMatch('hotfix/*', 'xhotfix/a')).toBe(false);
    expect(globMatch('a.b', 'aXb')).toBe(false);
  });
});

describe('evaluatePush', () => {
  it('refuses a new remote branch (overridable)', () => {
    const result = decide(update('refs/heads/feat/x', A, Z));
    expect(result).toMatchObject({
      allowed: false,
      code: 'new-branch',
      overridable: true,
    });
  });

  it('allows a fast-forward of main and production', () => {
    expect(decide(update('refs/heads/main', B, A)).code).toBe('ff-allowed');
    expect(decide(update('refs/heads/production', B, A)).allowed).toBe(true);
  });

  it('refuses a non-fast-forward of main without an override path', () => {
    const result = decide(update('refs/heads/main', A, B));
    expect(result).toMatchObject({
      allowed: false,
      code: 'non-ff',
      overridable: false,
    });
  });

  it('refuses deleting or creating a protected branch', () => {
    expect(decide(update('refs/heads/main', Z, A)).code).toBe(
      'protected-delete'
    );
    expect(decide(update('refs/heads/production', A, Z)).code).toBe(
      'protected-create'
    );
  });

  it('allows allowlisted branches, tags and other deletions', () => {
    expect(
      decide(update('refs/heads/hotfix/a', A, Z), {
        allowBranches: ['hotfix/*'],
      }).code
    ).toBe('allowlisted');
    expect(decide(update('refs/tags/v1.0.0', A, Z)).allowed).toBe(true);
    expect(decide(update('refs/heads/old', Z, A)).code).toBe('delete-allowed');
  });

  it('only updates existing release-please branches', () => {
    const name = 'refs/heads/release-please--branches--main';
    expect(decide(update(name, B, A)).code).toBe('existing-allowed');
    expect(decide(update(name, A, Z)).code).toBe('existing-only');
  });

  it('refuses other existing branches unless configured to allow', () => {
    expect(decide(update('refs/heads/feat/y', B, A)).code).toBe(
      'existing-branch'
    );
    expect(
      decide(update('refs/heads/feat/y', B, A), { existingBranches: 'allow' })
        .allowed
    ).toBe(true);
  });

  it('refuses refs outside heads and tags', () => {
    expect(decide(update('refs/notes/commits', A, Z)).code).toBe(
      'non-branch-ref'
    );
  });

  it('points refusals at the direct-to-main flow', () => {
    const message = refusalMessage(
      'tutur3u/platform',
      [decide(update('refs/heads/feat/x', A, Z))],
      'test-box'
    );
    expect(message).toContain('git push origin HEAD:main');
    expect(message).toContain('ttr git guard allow-once --kind push');
  });
});

describe('classifyGh', () => {
  it('detects gh pr create and its alias', () => {
    expect(classifyGh(['pr', 'create', '--fill'])).toMatchObject({
      createsPr: true,
      via: 'pr create',
    });
    expect(
      classifyGh(['pr', 'new', '-R', 'tutur3u/platform', '-H', 'feat/x'])
    ).toMatchObject({
      createsPr: true,
      explicitRepo: 'tutur3u/platform',
      head: 'feat/x',
    });
  });

  it('ignores read-only gh commands', () => {
    expect(classifyGh(['pr', 'list']).createsPr).toBe(false);
    expect(classifyGh(['pr', 'view', 'create']).createsPr).toBe(false);
    expect(classifyGh(['api', 'repos/tutur3u/platform/pulls']).createsPr).toBe(
      false
    );
  });

  it('detects REST pull creation by method or fields', () => {
    expect(
      classifyGh(['api', '-X', 'POST', '/repos/Tutur3u/platform/pulls'])
    ).toMatchObject({ createsPr: true, explicitRepo: 'tutur3u/platform' });
    expect(
      classifyGh(['api', 'repos/{owner}/{repo}/pulls', '-f', 'head=x'])
    ).toMatchObject({ createsPr: true, explicitRepo: null });
    expect(
      classifyGh(['api', '--method=POST', 'repos/a/b/pulls/1/reviews'])
        .createsPr
    ).toBe(false);
  });

  it('detects GraphQL createPullRequest and gh stack submit', () => {
    expect(
      classifyGh([
        'api',
        'graphql',
        '-f',
        'query=mutation { createPullRequest(input: {}) { clientMutationId } }',
      ]).via
    ).toBe('api graphql');
    expect(classifyGh(['stack', 'submit']).createsPr).toBe(true);
  });
});

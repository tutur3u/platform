import { describe, expect, it } from 'vitest';
import {
  getQueuedPlatformProjectReconciliation,
  normalizeInfrastructureProjectHostnames,
  parsePublicGitHubRepoUrl,
} from './projects';

describe('infrastructure projects', () => {
  it('normalizes public GitHub repository URLs', () => {
    expect(
      parsePublicGitHubRepoUrl('https://github.com/tutur3u/platform.git')
    ).toEqual({
      owner: 'tutur3u',
      repo: 'platform',
      repoUrl: 'https://github.com/tutur3u/platform',
    });
  });

  it('rejects non-GitHub repository URLs', () => {
    expect(() =>
      parsePublicGitHubRepoUrl('https://gitlab.com/tutur3u/platform')
    ).toThrow('Only public https://github.com repositories are supported.');
  });

  it('normalizes managed project hostnames before persistence', () => {
    expect(
      normalizeInfrastructureProjectHostnames([
        ' HTTPS://Docs.Example.COM/some/path ',
        'docs.example.com',
        'learn.example.co.uk',
      ])
    ).toEqual(['docs.example.com', 'learn.example.co.uk']);
  });

  it('rejects managed project hostnames that can inject nginx syntax', () => {
    expect(() =>
      normalizeInfrastructureProjectHostnames([
        'victim.example.com;\nreturn 200 "pwned";\n#',
      ])
    ).toThrow(
      'Enter managed project hostnames as DNS names without ports, wildcards, whitespace, or nginx syntax.'
    );

    expect(() =>
      normalizeInfrastructureProjectHostnames(['bad host.example.com'])
    ).toThrow(
      'Enter managed project hostnames as DNS names without ports, wildcards, whitespace, or nginx syntax.'
    );
  });

  it('rejects reserved Tuturuuu platform hostnames', () => {
    expect(() =>
      normalizeInfrastructureProjectHostnames([
        'https://tuturuuu.com/dashboard',
      ])
    ).toThrow(
      'Managed project hostnames cannot use reserved Tuturuuu platform hostnames.'
    );

    expect(() =>
      normalizeInfrastructureProjectHostnames(['hive.tuturuuu.com'])
    ).toThrow(
      'Managed project hostnames cannot use reserved Tuturuuu platform hostnames.'
    );
  });

  it('reconciles queued platform status from a served deployment', () => {
    expect(
      getQueuedPlatformProjectReconciliation(
        {
          deployment_status: 'queued',
          id: 'platform',
          latest_commit_hash: 'old111',
          updated_at: new Date('2026-05-04T01:00:00.000Z'),
        },
        [
          {
            commitHash: 'new222',
            commitShortHash: 'new222',
            commitSubject: 'fix infrastructure queue',
            deploymentStamp: '2026-05-04T01-05-00Z',
            finishedAt: Date.parse('2026-05-04T01:05:00.000Z'),
            runtimeState: 'active',
            status: 'successful',
          },
        ]
      )
    ).toMatchObject({
      deploymentStamp: '2026-05-04T01-05-00Z',
      latestCommitHash: 'new222',
      latestCommitShortHash: 'new222',
      latestCommitSubject: 'fix infrastructure queue',
    });
  });

  it('keeps queued platform status when the served deployment predates the queue', () => {
    expect(
      getQueuedPlatformProjectReconciliation(
        {
          deployment_status: 'queued',
          id: 'platform',
          latest_commit_hash: 'new222',
          updated_at: new Date('2026-05-04T01:10:00.000Z'),
        },
        [
          {
            commitHash: 'old111',
            finishedAt: Date.parse('2026-05-04T01:05:00.000Z'),
            runtimeState: 'active',
            status: 'successful',
          },
        ]
      )
    ).toBeNull();
  });
});

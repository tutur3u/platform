import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { changesBetween, releaseHistory } from './release-history.mjs';

describe('mobile beta release history', () => {
  test('uses mobile changes and removes commit metadata', () => {
    const calls = [];
    const changes = changesBetween('old', 'new', (command, args) => {
      calls.push([command, args]);
      return 'fix(mobile): restore sessions (#5482)\nfeat(mobile): improve settings (#5483)\nfix(mobile): restore sessions (#5482)\n';
    });

    expect(changes).toEqual(['restore sessions', 'improve settings']);
    expect(calls).toEqual([
      [
        'git',
        [
          'log',
          '--first-parent',
          '--format=%s',
          'old..new',
          '--',
          'apps/mobile',
        ],
      ],
    ]);
  });

  test('associates uploaded patch versions with their source and includes the next build', async () => {
    const originalFetch = globalThis.fetch;
    const paths = [];
    const responses = [
      { data: [{ id: 'app' }] },
      { data: [{ id: 'v1', attributes: { version: '0.11.1' } }], links: {} },
      {
        data: [
          {
            attributes: {
              version: '205001',
              uploadedDate: '2026-09-23T12:00:00Z',
            },
          },
        ],
      },
      {
        workflow_runs: [
          {
            run_number: 105,
            head_sha: 'previous',
            created_at: '2026-09-23T11:00:00Z',
          },
        ],
      },
    ];
    globalThis.fetch = async (url) => {
      paths.push(url);
      return { ok: true, json: async () => responses.shift() };
    };
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    try {
      const releases = await releaseHistory({
        credentials: { privateKey, keyId: 'key', issuerId: 'issuer' },
        githubToken: 'test-token',
        version: '0.11.2',
        sha: 'current',
        date: '2026-09-24',
        git: (_command, args) =>
          args[3] === 'mobile-v0.11.0..previous'
            ? 'feat(mobile): first patch (#1)'
            : 'fix(mobile): second patch (#2)',
      });

      expect(releases).toEqual([
        { version: '0.11.1', date: '2026-09-23', changes: ['first patch'] },
        { version: '0.11.2', date: '2026-09-24', changes: ['second patch'] },
      ]);
      expect(paths[2]).toContain('/v1/preReleaseVersions/v1/builds');
      expect(paths[3]).toContain('branch=production');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

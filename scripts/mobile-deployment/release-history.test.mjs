import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { changesBetween, releaseHistory } from './release-history.mjs';

describe('mobile beta release history', () => {
  test('uses mobile changes and removes commit metadata', () => {
    const calls = [];
    const changes = changesBetween('old', 'new', (command, args) => {
      calls.push([command, args]);
      return 'fix(mobile): restore sessions (#5482)\nfeat(mobile): improve settings (#5483)\nfix(mobile): restore sessions (#5482)\n';
    });

    assert.deepEqual(changes, ['restore sessions', 'improve settings']);
    assert.deepEqual(calls, [
      ['git', ['log', '--format=%s', 'old..new', '--', 'apps/mobile']],
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
        git: (_command, args) => {
          if (args[0] === 'merge-base') return '';
          return args[2] === 'mobile-v0.11.0..previous'
            ? 'feat(mobile): first patch (#1)'
            : 'fix(mobile): second patch (#2)';
        },
      });

      assert.deepEqual(releases, [
        { version: '0.11.1', date: '2026-09-23', changes: ['first patch'] },
        { version: '0.11.2', date: '2026-09-24', changes: ['second patch'] },
      ]);
      assert.ok(paths[2].includes('/v1/preReleaseVersions/v1/builds'));
      assert.ok(
        paths[3].includes('/actions/workflows/mobile-deploy-stores.yaml/runs')
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  for (const changes of ['', 'fix(mobile): follow-up after release tag (#3)']) {
    test(`preserves published .0 notes when tag-to-build changes are ${changes ? 'present' : 'empty'}`, async () => {
      const originalFetch = globalThis.fetch;
      const responses = [{ data: [{ id: 'app' }] }, { data: [], links: {} }];
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => responses.shift(),
      });
      const { privateKey } = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
      });
      try {
        const releases = await releaseHistory({
          credentials: { privateKey, keyId: 'key', issuerId: 'issuer' },
          githubToken: 'test-token',
          version: '0.21.0',
          sha: 'current',
          date: '2026-09-30',
          git: (_command, args) => {
            if (args[0] === 'merge-base') return '';
            assert.equal(args[2], 'mobile-v0.21.0..current');
            return changes;
          },
        });
        assert.deepEqual(
          releases,
          changes
            ? [
                {
                  version: '0.21.0',
                  date: '2026-09-30',
                  changes: ['follow-up after release tag'],
                },
              ]
            : []
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }

  test('keeps a historical manual build without blocking the current beta', async () => {
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    const responses = [
      { data: [{ id: 'app' }] },
      { data: [{ id: 'v1', attributes: { version: '0.11.1' } }], links: {} },
      {
        data: [
          {
            attributes: {
              version: '1',
              uploadedDate: '2026-09-23T12:00:00Z',
            },
          },
        ],
      },
    ];
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => responses.shift(),
    });
    const warnings = [];
    console.warn = (message) => warnings.push(message);
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
          args[0] === 'merge-base' ? '' : 'fix(mobile): current patch (#2)',
      });
      assert.deepEqual(releases, [
        { version: '0.11.1', date: '2026-09-23', changes: [] },
        { version: '0.11.2', date: '2026-09-24', changes: ['current patch'] },
      ]);
      assert.ok(warnings[0].includes('0.11.1 (build 1)'));
    } finally {
      globalThis.fetch = originalFetch;
      console.warn = originalWarn;
    }
  });

  test('uses the last reachable tag when a new minor has no base tag', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'app' }], links: {} }),
    });
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const calls = [];
    try {
      const releases = await releaseHistory({
        credentials: { privateKey, keyId: 'key', issuerId: 'issuer' },
        githubToken: 'test-token',
        version: '0.12.1',
        sha: 'current',
        date: '2026-09-25',
        git: (_command, args) => {
          calls.push(args);
          if (args[0] === 'merge-base') throw new Error('tag absent');
          return args[0] === 'describe'
            ? 'mobile-v0.11.0\n'
            : 'fix(mobile): reserve full floating header height (#5521)';
        },
      });

      assert.deepEqual(releases, [
        {
          version: '0.12.1',
          date: '2026-09-25',
          changes: ['reserve full floating header height'],
        },
      ]);
      assert.deepEqual(calls[2].slice(0, 3), [
        'log',
        '--format=%s',
        'mobile-v0.11.0..current',
      ]);
      assert.deepEqual(calls[1], [
        'describe',
        '--first-parent',
        '--tags',
        '--match',
        'mobile-v*',
        '--abbrev=0',
        'current',
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('finds product commits introduced by a merge without exposing its tracking subject', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-note-git-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  const commit = (subject, content) => {
    writeFileSync(join(directory, 'apps/mobile/change.txt'), content);
    git('add', 'apps/mobile/change.txt');
    git('commit', '-m', subject);
  };
  try {
    git('init', '-b', 'main');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'user.name', 'Release fixture');
    mkdirSync(join(directory, 'apps/mobile'), { recursive: true });
    commit('feat(mobile): initial fixture', 'base');
    const base = git('rev-parse', 'HEAD');
    git('checkout', '-b', 'feature/product');
    commit('fix(mobile): merge duplicate contacts', 'product');
    git('checkout', 'main');
    git(
      'merge',
      '--no-ff',
      'feature/product',
      '-m',
      "Merge remote-tracking branch 'origin/main'"
    );
    const changes = changesBetween(base, 'HEAD', (command, args) =>
      execFileSync(command, args, { cwd: directory, encoding: 'utf8' })
    );
    assert.deepEqual(changes, ['merge duplicate contacts']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

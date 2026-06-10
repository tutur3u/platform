const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_AUTO_PRODUCTION_PROMOTION_DELAY_MS,
  createCiSummary,
  evaluateProductionPromotion,
  parseGitHubRepositoryFromRemote,
} = require('./production-promotion.js');

test('createCiSummary requires at least one passing GitHub signal', () => {
  assert.equal(createCiSummary().state, 'missing');
  assert.equal(
    createCiSummary({
      checkRuns: [
        {
          conclusion: 'success',
          status: 'completed',
        },
      ],
      statuses: [
        {
          state: 'success',
        },
      ],
    }).state,
    'passing'
  );
  assert.equal(
    createCiSummary({
      checkRuns: [
        {
          conclusion: 'failure',
          status: 'completed',
        },
      ],
    }).state,
    'failing'
  );
  assert.equal(
    createCiSummary({
      checkRuns: [
        {
          conclusion: null,
          status: 'in_progress',
        },
      ],
    }).state,
    'pending'
  );
});

test('evaluateProductionPromotion waits for age and green CI by default', () => {
  const now = Date.parse('2026-06-10T10:10:00.000Z');
  const main = {
    committedAt: '2026-06-10T10:05:00.000Z',
    hash: 'main123',
    shortHash: 'main123',
    subject: 'Ship main',
  };
  const production = {
    committedAt: '2026-06-10T09:00:00.000Z',
    hash: 'prod123',
    shortHash: 'prod123',
    subject: 'Current production',
  };

  const evaluation = evaluateProductionPromotion({
    ci: { state: 'pending' },
    isFastForward: true,
    main,
    now,
    production,
  });

  assert.equal(evaluation.ready, false);
  assert.equal(
    evaluation.waitRemainingMs,
    DEFAULT_AUTO_PRODUCTION_PROMOTION_DELAY_MS - 5 * 60_000
  );
  assert.deepEqual(evaluation.blockedReasons, [
    'waiting-for-age',
    'ci-not-green',
  ]);
});

test('evaluateProductionPromotion lets a manual request bypass only CI and age gates', () => {
  const evaluation = evaluateProductionPromotion({
    ci: { state: 'failing' },
    isFastForward: true,
    main: {
      committedAt: '2026-06-10T10:09:30.000Z',
      hash: 'main123',
    },
    now: Date.parse('2026-06-10T10:10:00.000Z'),
    production: {
      hash: 'prod123',
    },
    request: {
      kind: 'production-promote',
    },
  });

  assert.equal(evaluation.bypassed, true);
  assert.equal(evaluation.ready, true);

  const blocked = evaluateProductionPromotion({
    ci: { state: 'passing' },
    isFastForward: false,
    main: {
      committedAt: '2026-06-10T10:00:00.000Z',
      hash: 'main123',
    },
    now: Date.parse('2026-06-10T10:20:00.000Z'),
    production: {
      hash: 'prod123',
    },
    request: {
      kind: 'production-promote',
    },
  });

  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.blockedReasons, ['not-fast-forward']);
});

test('parseGitHubRepositoryFromRemote supports common GitHub remotes', () => {
  assert.deepEqual(
    parseGitHubRepositoryFromRemote('git@github.com:tutur3u/platform.git'),
    {
      owner: 'tutur3u',
      repo: 'platform',
    }
  );
  assert.deepEqual(
    parseGitHubRepositoryFromRemote('https://github.com/tutur3u/platform.git'),
    {
      owner: 'tutur3u',
      repo: 'platform',
    }
  );
  assert.equal(
    parseGitHubRepositoryFromRemote('https://example.com/tutur3u/platform.git'),
    null
  );
});

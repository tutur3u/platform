const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isBlueGreenWebAlreadyPromoted,
  resolveLatestCommitHash,
} = require('./promotion-reuse.js');

test('promotion reuse requires the recorded lane to still be running', () => {
  const previousTargetState = {
    targets: {
      web: {
        activeColor: 'blue',
        commitHash: 'abc123',
        frontend: 'next',
        health: 'healthy',
      },
    },
  };

  assert.equal(
    isBlueGreenWebAlreadyPromoted({
      activeColor: 'blue',
      latestCommitHash: 'abc123',
      previousTargetState,
      selectedFrontend: 'next',
    }),
    true
  );
  assert.equal(
    isBlueGreenWebAlreadyPromoted({
      activeColor: null,
      latestCommitHash: 'abc123',
      previousTargetState,
      selectedFrontend: 'next',
    }),
    false
  );
  assert.equal(
    isBlueGreenWebAlreadyPromoted({
      activeColor: 'green',
      latestCommitHash: 'abc123',
      previousTargetState,
      selectedFrontend: 'next',
    }),
    false
  );
});

test('latest commit reuse accepts only a non-empty hash', () => {
  assert.equal(resolveLatestCommitHash({ hash: 'abc123' }), 'abc123');
  assert.equal(resolveLatestCommitHash({ hash: '' }), null);
  assert.equal(resolveLatestCommitHash(undefined), null);
});

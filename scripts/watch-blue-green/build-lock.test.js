const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { deploymentLockMatchesProcessCmdline } = require('./build-lock.js');

describe('deploymentLockMatchesProcessCmdline', () => {
  const lock = {
    command: 'bun serve:web:docker:bg',
    deploymentKind: 'manual',
  };

  it('matches bun argv that includes the package script name', () => {
    assert.equal(
      deploymentLockMatchesProcessCmdline(
        lock,
        '/usr/bin/bun run serve:web:docker:bg'.toLowerCase()
      ),
      true
    );
  });

  it('matches node scripts/docker-web.js (package.json invokes node, not bun argv)', () => {
    assert.equal(
      deploymentLockMatchesProcessCmdline(
        lock,
        'node /repo/scripts/docker-web.js up --mode prod --strategy blue-green'.toLowerCase()
      ),
      true
    );
  });

  it('does not match unrelated long tokens in cmdline', () => {
    assert.equal(
      deploymentLockMatchesProcessCmdline(
        lock,
        'node /repo/scripts/some-other-deploy.js --mode prod'.toLowerCase()
      ),
      false
    );
  });
});

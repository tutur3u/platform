import assert from 'node:assert/strict';
import test from 'node:test';
import { pointsAtSharedDatabase } from './probe-shared-port.mjs';

test('shared port guard rejects a TOML plus and ignores comments', () => {
  assert.equal(pointsAtSharedDatabase('smtp_port = +8005'), true);
  assert.equal(pointsAtSharedDatabase('port = 8001'), true);
  assert.equal(pointsAtSharedDatabase('project_id = "tuturuuu"'), true);
  assert.equal(pointsAtSharedDatabase('# smtp_port = 8005'), false);
  assert.equal(pointsAtSharedDatabase('# pop3_port = +8004'), false);
  assert.equal(pointsAtSharedDatabase('port = 18521'), false);
  assert.equal(pointsAtSharedDatabase('smtp_port = +18524'), false);
});

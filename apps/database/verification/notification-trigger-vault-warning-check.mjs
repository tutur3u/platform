// Check the combined stdout/stderr from the disposable notification pgTAP suite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const logPath = process.argv[2];
assert.ok(
  logPath,
  'Usage: node notification-trigger-vault-warning-check.mjs <pgTAP-log>'
);
const output = readFileSync(logPath, 'utf8');
assert.match(output, /Result: PASS/, 'The notification pgTAP suite must pass');
const warning =
  'notification_immediate_bearer is not configured; immediate send suppressed';
const warnings = [...output.matchAll(/WARNING:\s+([^\r\n]+)/g)].map(
  (match) => match[1]
);
assert.equal(
  warnings.filter((message) => message === warning).length,
  2,
  'Missing and blank Vault secrets must each emit the safe suppression WARNING'
);
console.log(
  'Missing and blank Vault bearer WARNING assertions passed (2/2); pgTAP passed.'
);

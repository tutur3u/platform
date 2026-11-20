const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const file = path.join(
  __dirname,
  '../../.github/workflows/chat-realtime-staging-qualification.yaml'
);
const text = fs.readFileSync(file, 'utf8');

test('staging qualification is a private main dispatch', () => {
  assert.match(text, /^on:\n {2}workflow_dispatch:\n/m);
  assert.doesNotMatch(text, /\bpull_request/);
  assert.doesNotMatch(text, /\n {2}push:/);
  assert.match(text, /^permissions:\n {2}contents: read\n/m);
  assert.match(
    text,
    /github\.repository == 'tutur3u\/platform' && github\.ref == 'refs\/heads\/main'/
  );
  assert.doesNotMatch(text, /\benvironment:/);
  assert.doesNotMatch(text, /echo[^\n]*secrets\./);
  assert.match(text, /echo "missing \$name"/);
  assert.match(text, /qualify-chat-realtime\.mjs --phase=/);
});

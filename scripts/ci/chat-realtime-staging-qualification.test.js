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
  assert.doesNotMatch(text, /\bschedule:/);
  assert.doesNotMatch(text, /["']schedule["']\s*:/);
  assert.match(text, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(text, /contents: write/);
  assert.doesNotMatch(text, /contents:\s*write/);
  assert.doesNotMatch(text, /\bcontents\s*:\s*write\b/);
  assert.match('"schedule":', /["']schedule["']\s*:/);
  assert.match('contents:  write', /contents:\s*write/);
  assert.match('contents : write', /\bcontents\s*:\s*write\b/);
  assert.doesNotMatch('contents: read', /\bcontents\s*:\s*write\b/);
  assert.doesNotMatch('contents : read', /\bcontents\s*:\s*write\b/);
  assert.match(
    text,
    /^ {4}if: github\.repository == 'tutur3u\/platform' && github\.ref == 'refs\/heads\/main'$/m
  );
  assert.match(text, /cancel-in-progress: false/);
  assert.doesNotMatch(text, /cancel-in-progress:\s*true/);
  assert.doesNotMatch(text, /\benvironment:/);
  assert.doesNotMatch(text, /QUALIFY_LOCAL/);
  assert.doesNotMatch(text, /echo[^\n]*secrets\./);
  assert.match(text, /echo "missing \$name"/);
  assert.match(text, /qualify-chat-realtime\.mjs --phase=/);
  const secretCheck = text.indexOf('Require qualification secrets');
  const checkout = text.indexOf('actions/checkout@');
  assert.ok(secretCheck !== -1 && checkout !== -1 && secretCheck < checkout);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { judgeSignedInRoot } from './signed-in-root-check.mjs';

const base = { requestedUrl: 'https://chat.tuturuuu.com/', errors: [] };

test('passes a root that redirected to the workspace with a clean console', () => {
  assert.deepEqual(
    judgeSignedInRoot({
      ...base,
      finalUrl: 'https://chat.tuturuuu.com/personal?conversationId=abc',
      text: 'New chat',
    }),
    []
  );
});

test('fails the error boundary and the minified React render error', () => {
  const problems = judgeSignedInRoot({
    ...base,
    finalUrl: 'https://chat.tuturuuu.com/',
    text: 'Something went wrong!',
    errors: [
      'Error: Minified React error #441; visit https://react.dev/errors/441',
    ],
  });
  assert.equal(problems.length, 3);
  assert.match(problems[0], /error boundary/u);
  assert.match(problems[1], /stayed on \//u);
  assert.match(problems[2], /React render error/u);
});

test('fails a session that was not accepted', () => {
  const [problem] = judgeSignedInRoot({
    ...base,
    finalUrl: 'https://chat.tuturuuu.com/login',
    text: 'Sign in',
  });
  assert.match(problem, /not accepted/u);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeBrowserResults } from './mail-profile-result-summary.mjs';

const titles = ['fixed profile', 'fixed transport'];
const spec = (title, status) => ({ title, tests: [{ results: [{ status }] }] });

test('preserves passed transport alongside failed profile without leaking errors', () => {
  const summary = summarizeBrowserResults(
    {
      suites: [
        {
          specs: [
            { ...spec(titles[0], 'failed'), error: 'private token' },
            spec(titles[1], 'passed'),
            spec('private unrelated title', 'passed'),
          ],
        },
      ],
    },
    titles
  );
  assert.deepEqual(summary, [
    { title: titles[0], status: 'failed' },
    { title: titles[1], status: 'passed' },
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /private/u);
});

test('does not manufacture success for absent, retried, malformed or duplicate results', () => {
  for (const report of [
    { suites: [] },
    { suites: [{ specs: [spec(titles[0], 'private status')] }] },
    {
      suites: [
        { specs: [spec(titles[0], 'passed'), spec(titles[0], 'passed')] },
      ],
    },
    {
      suites: [
        {
          specs: [
            {
              title: titles[0],
              tests: [
                { results: [{ status: 'failed' }, { status: 'passed' }] },
              ],
            },
          ],
        },
      ],
    },
    { suites: [{ specs: 'private malformed value' }] },
    { suites: Array.from({ length: 201 }, () => ({})) },
  ])
    assert.deepEqual(summarizeBrowserResults(report, titles), []);
});

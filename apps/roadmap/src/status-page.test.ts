import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

/** Wiring problems in the root route and Worker; empty when both use it. */
export function statusWiringProblems(
  root: string,
  worker: string,
  page: string
) {
  const problems: string[] = [];
  if (!root.includes("from '@tuturuuu/ui/custom/status-page'"))
    problems.push('root imports the shared status page');
  if (!/notFoundComponent:\s*RoadmapNotFound/.test(root))
    problems.push('notFoundComponent');
  if (!/errorComponent:\s*RoadmapError/.test(root))
    problems.push('errorComponent');
  if (!/variant="not-found"/.test(root) || !/variant="error"/.test(root))
    problems.push('both variants');
  if (/<h1>/.test(root)) problems.push('bespoke heading');
  if (
    !/boundary\.status === 404\s*\?\s*await withContentSecurityPolicy\(roadmapNotFoundResponse\(request\)\)/.test(
      worker
    )
  )
    problems.push('worker 404 renders the shared page');
  if (
    !/withRoadmapCachePolicy\(\s*request,\s*boundary\.status === 404/.test(
      worker
    )
  )
    problems.push('worker 404 keeps the cache policy');
  if (!page.includes('StatusPageDocument') || !/status: 404/.test(page))
    problems.push('404 document');
  return problems;
}

test('root route and Worker 404 use the shared status page', () => {
  assert.deepEqual(
    statusWiringProblems(
      read('./routes/__root.tsx'),
      read('./worker.ts'),
      read('./not-found-response.tsx')
    ),
    []
  );
});

test('a bare not-found page and a plain-text Worker 404 are rejected', () => {
  const root = `notFoundComponent: () => (<main><h1>Page not found</h1></main>),`;
  const worker = `if (boundary) return withRoadmapCachePolicy(request, boundary);`;
  const page = `return new Response('Not Found', { status: 404 });`;
  assert.deepEqual(statusWiringProblems(root, worker, page), [
    'root imports the shared status page',
    'notFoundComponent',
    'errorComponent',
    'both variants',
    'bespoke heading',
    'worker 404 renders the shared page',
    'worker 404 keeps the cache policy',
    '404 document',
  ]);
});

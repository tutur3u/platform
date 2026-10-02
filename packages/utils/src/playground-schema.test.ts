import { expect, it } from 'vitest';
import {
  PlaygroundDelta,
  PlaygroundFiles,
  PlaygroundJob,
  PlaygroundRunnerExport,
} from './playground-schema';

it.each([
  '../secret',
  'a/../../secret',
  '/absolute',
  'node_modules/pkg.js',
  'a/.git/config',
  'a//b',
  'a\\b',
])('rejects unsafe path %s', (path) =>
  expect(PlaygroundFiles.safeParse([{ path, content: 'x' }]).success).toBe(
    false
  )
);
it('enforces UTF-8 byte limits rather than only character counts', () =>
  expect(
    PlaygroundFiles.safeParse([{ path: 'a', content: 'ấ'.repeat(100000) }])
      .success
  ).toBe(false));
it('rejects inconsistent delta inventories', () => {
  expect(
    PlaygroundDelta.safeParse({
      revision: 1,
      command: 'run',
      paths: ['a', 'a/b'],
      files: [],
    }).success
  ).toBe(false);
  expect(
    PlaygroundDelta.safeParse({
      revision: 1,
      command: 'run',
      paths: ['a'],
      files: [{ path: 'b', content: 'x' }],
    }).success
  ).toBe(false);
});
it('bounds preview requests to approved ports and paths', () => {
  const job = {
    projectId: '00000000-0000-4000-8000-000000000001',
    revision: 0,
    language: 'python',
    operation: 'preview',
    port: 22,
    path: '/',
  };
  expect(PlaygroundJob.safeParse(job).success).toBe(false);
  expect(
    PlaygroundJob.safeParse({ ...job, port: 3000, path: '/\r\nHost:metadata' })
      .success
  ).toBe(false);
});

it('rejects file/directory collisions with intervening sorted siblings', () => {
  const paths = ['a', 'a-b', 'a/b'];
  expect(
    PlaygroundFiles.safeParse(paths.map((path) => ({ path, content: 'x' })))
      .success
  ).toBe(false);
  expect(
    PlaygroundDelta.safeParse({ revision: 1, command: 'run', paths, files: [] })
      .success
  ).toBe(false);
});

it('rejects conflicting runner inventory ancestors', () => {
  expect(
    PlaygroundRunnerExport.safeParse({
      revision: 1,
      paths: ['a', 'a-b', 'a/b'],
      files: [],
      baseline: {},
    }).success
  ).toBe(false);
});

it.each([
  '/../secret',
  '/a/./b',
  '/a//b',
  '//other-host',
  '/%2e%2e/secret',
  '/a%2f../secret',
  '/a\\b',
  '/%',
])('rejects unsafe preview path %s', (path) => {
  expect(
    PlaygroundJob.safeParse({
      projectId: '00000000-0000-4000-8000-000000000001',
      revision: 0,
      language: 'python',
      operation: 'preview',
      port: 3000,
      path,
    }).success
  ).toBe(false);
});
it.each(['/', '/index.html', '/assets/app.js?version=1'])(
  'accepts ordinary preview path %s',
  (path) => {
    expect(
      PlaygroundJob.safeParse({
        projectId: '00000000-0000-4000-8000-000000000001',
        revision: 0,
        language: 'python',
        operation: 'preview',
        port: 3000,
        path,
      }).success
    ).toBe(true);
  }
);

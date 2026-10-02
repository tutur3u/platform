import { expect, it } from 'vitest';
import {
  PlaygroundDelta,
  PlaygroundFiles,
  PlaygroundJob,
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

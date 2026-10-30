import { expect, test } from 'vitest';
import { isSafeProjectBranch } from './managed-project-branch';

test('shares a strict branch allowlist', () => {
  for (const value of [
    '--upload-pack=evil',
    '..',
    '-main',
    ' ',
    ' main',
    'main branch',
    'a//b',
    'a/.b',
    'a/',
  ])
    expect(isSafeProjectBranch(value)).toBe(false);
  for (const value of ['main', 'production', 'fix/example'])
    expect(isSafeProjectBranch(value)).toBe(true);
});

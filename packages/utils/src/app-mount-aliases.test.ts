import { describe, expect, it } from 'vitest';
import {
  getAppMountBasePaths,
  ONE_ORIGIN_APP_BASE_PATHS,
  resolveMountedAppFromUrl,
} from './app-mounts';
import { getMountedAppVerifyTokenMatch } from './internal-app-mounts';
import { isReservedWorkspaceHandle } from './workspace-handle';

const active = new Set(['learn', 'teach', 'tasks']);

describe('shared-origin mount aliases', () => {
  it.each([
    [
      'https://tuturuuu.com/lms/learn/en/course',
      'learn',
      '/lms/learn',
      '/en/course',
    ],
    ['https://tuturuuu.com/lms/teach/x', 'teach', '/lms/teach', '/x'],
    ['https://tuturuuu.com/learn/en', 'learn', '/learn', '/en'],
  ])('resolves %s', (url, app, basePath, appPath) => {
    expect(resolveMountedAppFromUrl(url, active)).toEqual({
      app,
      basePath,
      appPath,
    });
  });

  it.each([
    [
      'https://tuturuuu.com/lms/learn/verify-token?nextUrl=%2Fen%2Fcourse',
      '/lms/learn',
    ],
    [
      'https://tuturuuu.com/lms/teach/vi/verify-token?nextUrl=%2F',
      '/lms/teach',
    ],
    ['https://tuturuuu.com/learn/verify-token?nextUrl=%2F', '/learn'],
  ])('keeps the alias base for the verify-token return %s', (url, basePath) => {
    const match = getMountedAppVerifyTokenMatch(url, active);
    expect(match?.basePath).toBe(basePath);
  });

  it('does not treat a lookalike alias as a mount', () => {
    expect(
      getMountedAppVerifyTokenMatch(
        'https://tuturuuu.com/lms/learning/verify-token',
        active
      )
    ).toBeNull();
  });

  it('reserves the first segment of every mount base as a workspace handle', () => {
    for (const app of Object.keys(ONE_ORIGIN_APP_BASE_PATHS)) {
      for (const base of getAppMountBasePaths(app)) {
        expect(isReservedWorkspaceHandle(base.split('/')[1] ?? '')).toBe(true);
      }
    }
  });
});

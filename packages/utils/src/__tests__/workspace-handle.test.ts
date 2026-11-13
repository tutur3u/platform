import { describe, expect, it } from 'vitest';
import {
  isReservedWorkspaceHandle,
  RESERVED_WORKSPACE_HANDLES,
  WORKSPACE_HANDLE_REGEX,
} from '../workspace-handle';

describe('reserved workspace handles', () => {
  it('reserves the workspace routes and every mounted app path', () => {
    for (const handle of [
      'personal',
      'login',
      'tasks',
      'calendar',
      'finance',
      'track',
      'drive',
      'learn',
      'forms',
      'teach',
      'tools',
      'cms',
      'meet',
      'mail',
      'store',
      'apps',
      'roadmap',
      'design',
    ]) {
      expect(isReservedWorkspaceHandle(handle)).toBe(true);
    }
  });

  it('matches case-insensitively after trimming', () => {
    expect(isReservedWorkspaceHandle(' Tasks ')).toBe(true);
    expect(isReservedWorkspaceHandle('CALENDAR')).toBe(true);
  });

  it('only reserves whole handles', () => {
    expect(isReservedWorkspaceHandle('tasks-team')).toBe(false);
    expect(isReservedWorkspaceHandle('my-calendar')).toBe(false);
    expect(isReservedWorkspaceHandle('acme')).toBe(false);
  });

  it('lists only lowercase handles that the handle format could produce', () => {
    for (const handle of RESERVED_WORKSPACE_HANDLES) {
      expect(handle).toBe(handle.toLowerCase());
      expect(WORKSPACE_HANDLE_REGEX.test(handle)).toBe(true);
    }
    expect(new Set(RESERVED_WORKSPACE_HANDLES).size).toBe(
      RESERVED_WORKSPACE_HANDLES.length
    );
  });
});

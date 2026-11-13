import { TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS } from '@tuturuuu/utils/next-config';
import { describe, expect, it } from 'vitest';
import {
  TASKS_CENTRAL_FIRST_API_PATTERNS,
  TASKS_OWNED_API_PATTERNS,
  tasksAppBaseResolver,
} from './app-base';

describe('Tasks app-API base resolver', () => {
  it('uses the shared Web workspace reservation policy', () => {
    expect(TASKS_CENTRAL_FIRST_API_PATTERNS).toBe(
      TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS
    );
    for (const pattern of TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS) {
      expect(tasksAppBaseResolver.owns(pattern.replace(':wsId', 'ws-1'))).toBe(
        false
      );
    }
  });
  it('never treats the /api catch-all as ownership', () => {
    expect(TASKS_OWNED_API_PATTERNS).not.toContain('/api/[...path]');
    expect(TASKS_OWNED_API_PATTERNS.length).toBeGreaterThan(100);
  });

  it('owns explicit Tasks routes', () => {
    for (const path of [
      '/api/workspaces/ws-1',
      '/api/v1/workspaces/ws-1/task-boards',
      '/api/v1/workspaces/ws-1/task-boards/b-1/sprints/unplanned',
      '/api/v1/workspaces/ws-1/task-drafts',
    ]) {
      expect(tasksAppBaseResolver.owns(path)).toBe(true);
    }
  });

  it('leaves Web routes to Web', () => {
    for (const path of [
      '/api/workspaces/invitations',
      '/api/v1/workspaces',
      '/api/v1/users/me/profile',
      '/api/v1/auth/accounts',
      '/api/v1/workspaces/ws-1/members',
    ]) {
      expect(tasksAppBaseResolver.owns(path)).toBe(false);
      expect(tasksAppBaseResolver(path)).toBe(path);
    }
  });
});

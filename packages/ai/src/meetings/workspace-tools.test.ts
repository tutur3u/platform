import { expect, it, vi } from 'vitest';

vi.mock('../tools/definitions/time-tracking', async (original) => {
  const module =
    await original<typeof import('../tools/definitions/time-tracking')>();
  return {
    ...module,
    timeTrackingToolDefinitions: {
      ...module.timeTrackingToolDefinitions,
      future_workspace_mutation: { inputSchema: {} },
    },
  };
});

import { createMeetWorkspaceTools } from './workspace-tools';

it('gates permissioned tools and fails closed for new unannotated workspace operations', () => {
  const denied = createMeetWorkspaceTools({} as never, () => true);
  expect(denied).not.toHaveProperty('create_task');
  expect(denied).not.toHaveProperty('create_event');
  expect(denied).not.toHaveProperty('create_wallet');
  expect(denied).not.toHaveProperty('future_workspace_mutation');
  expect(denied).toHaveProperty('get_my_tasks');
  expect(denied).toHaveProperty('list_time_tracking_sessions');
  const allowed = createMeetWorkspaceTools({} as never, () => false);
  expect(allowed).toHaveProperty('create_task');
  expect(allowed).not.toHaveProperty('future_workspace_mutation');
  expect(allowed).not.toHaveProperty('enable_e2ee');
});

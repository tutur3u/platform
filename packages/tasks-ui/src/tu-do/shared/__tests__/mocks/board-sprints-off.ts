import { vi } from 'vitest';

/** Task sprint API for board tests that don't exercise sprints: sprints off. */
export const listWorkspaceTaskBoardSprints = async () => ({
  schemaAvailable: true,
  sprintLengthWeeks: null,
  sprints: [],
});
export const endWorkspaceTaskBoardSprint = vi.fn();
export const moveTasksToWorkspaceTaskBoardSprint = vi.fn();
export const startWorkspaceTaskBoardSprint = vi.fn();
export const updateWorkspaceTaskBoardSprint = vi.fn();
export const updateWorkspaceTaskBoardSprintLength = vi.fn();

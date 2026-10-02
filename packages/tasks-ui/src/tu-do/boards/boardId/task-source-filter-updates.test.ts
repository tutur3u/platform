import { expect, it } from 'vitest';
import type { TaskFilters } from '../../shared/task-filter.types';
import {
  updateBoardSourceFilter,
  updateWorkspaceSourceFilter,
} from './task-source-filter-updates';

const filters: TaskFilters = {
  labels: [],
  assignees: [],
  projects: [],
  priorities: [],
  dueDateRange: null,
  estimationRange: null,
  includeMyTasks: false,
  includeUnassigned: false,
  sourceScope: 'external_specific',
  sourceWorkspaceIds: ['hidden', 'visible'],
  sourceBoardIds: ['hidden-board', 'visible-board'],
};
const boards = [
  { id: 'visible-board', workspaceId: 'visible' },
  { id: 'other-board', workspaceId: 'other' },
];
it('changing visible workspace choices retains omitted saved workspace and board IDs', () => {
  expect(
    updateWorkspaceSourceFilter(
      filters,
      [{ id: 'visible' }, { id: 'other' }],
      boards,
      ['other']
    )
  ).toMatchObject({
    sourceWorkspaceIds: ['hidden', 'other'],
    sourceBoardIds: ['hidden-board'],
  });
  expect(filters.sourceWorkspaceIds).toEqual(['hidden', 'visible']);
});
it('changing visible board choices retains omitted saved boards and their workspace scopes', () => {
  expect(
    updateBoardSourceFilter(filters, boards, ['other-board'])
  ).toMatchObject({
    sourceBoardIds: ['hidden-board', 'other-board'],
    sourceWorkspaceIds: ['hidden', 'visible', 'other'],
  });
});

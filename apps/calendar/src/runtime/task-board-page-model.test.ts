import type { getWorkspaceTaskBoard } from '@tuturuuu/internal-api';
import { describe, expect, it, vi } from 'vitest';
import { loadTaskBoardPageModel } from '../../../../packages/tasks-ui/src/tu-do/boards/boardId/task-board-page-model';

type Board = Awaited<ReturnType<typeof getWorkspaceTaskBoard>>['board'];
const guestBoard = {
  id: 'board',
  ws_id: 'actual-workspace',
  access_type: 'guest',
  name: 'Shared board',
  creator_id: null,
  created_at: null,
  deleted_at: null,
  archived_at: null,
  estimation_type: null,
  icon: null,
  allow_zero_estimates: false,
  count_unestimated_issues: false,
  extended_estimation: false,
  next_task_number: 1,
  sprint_length_weeks: null,
  template_id: null,
  ticket_prefix: null,
  default_list_id: null,
  default_done_list_id: null,
  default_closed_list_id: null,
} satisfies Board;
const auth = { defaultHeaders: { cookie: 'app=fixture' } };

describe('portable authorized task board page model', () => {
  it('denies an absent actor before board or workspace suppliers', async () => {
    const getBoard = vi.fn(async () => guestBoard);
    const getWorkspace = vi.fn(async () => null);
    expect(
      await loadTaskBoardPageModel({
        boardId: 'board',
        user: null,
        auth,
        getBoard,
        getWorkspace,
      })
    ).toBeNull();
    expect(getBoard).not.toHaveBeenCalled();
    expect(getWorkspace).not.toHaveBeenCalled();
  });
  it('retains the forwarded auth tuple and exact minimal guest workspace', async () => {
    const user = { id: 'actor' };
    const getBoard = vi.fn(async () => guestBoard);
    const getWorkspace = vi.fn(async () => null);
    const result = await loadTaskBoardPageModel({
      boardId: 'board',
      user,
      auth,
      getBoard,
      getWorkspace,
    });
    expect(getBoard).toHaveBeenCalledWith(user, auth);
    expect(result?.access).toBe('guest');
    expect(result?.workspace).toEqual({
      id: 'actual-workspace',
      personal: false,
      tier: null,
    });
    expect(getWorkspace).not.toHaveBeenCalled();
  });
  it('does not replace a missing authorized board with a workspace read', async () => {
    const getWorkspace = vi.fn(async () => null);
    expect(
      await loadTaskBoardPageModel({
        boardId: 'board',
        user: { id: 'actor' },
        auth,
        getBoard: async () => null,
        getWorkspace,
      })
    ).toBeNull();
    expect(getWorkspace).not.toHaveBeenCalled();
  });
  it('rejects a different board returned for the route identity', async () => {
    const getWorkspace = vi.fn(async () => null);
    expect(
      await loadTaskBoardPageModel({
        boardId: 'different-board',
        user: { id: 'actor' },
        auth,
        getBoard: async () => guestBoard,
        getWorkspace,
      })
    ).toBeNull();
    expect(getWorkspace).not.toHaveBeenCalled();
  });
  it('rejects member access without the authorized workspace', async () => {
    const getWorkspace = vi.fn(async () => null);
    expect(
      await loadTaskBoardPageModel({
        boardId: 'board',
        user: { id: 'actor' },
        auth,
        getBoard: async () => ({ ...guestBoard, access_type: 'member' }),
        getWorkspace,
      })
    ).toBeNull();
    expect(getWorkspace).toHaveBeenCalledWith('actual-workspace', {
      id: 'actor',
    });
  });
  it('rejects a member workspace response for another workspace', async () => {
    const workspace = {
      id: 'wrong-workspace',
      personal: false,
      joined: true,
      tier: null,
      avatar_url: null,
      created_at: null,
      creator_id: 'actor',
      deleted: false,
      energy_profile: null,
      first_day_of_week: null,
      handle: null,
      logo_url: null,
      name: 'Fixture workspace',
      scheduling_settings: null,
      timezone: null,
    };
    expect(
      await loadTaskBoardPageModel({
        boardId: 'board',
        user: { id: 'actor' },
        auth,
        getBoard: async () => ({ ...guestBoard, access_type: 'member' }),
        getWorkspace: async () => workspace,
      })
    ).toBeNull();
  });
});

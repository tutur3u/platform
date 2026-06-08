import { describe, expect, it } from 'vitest';
import { ChatRequestBodySchema } from './chat-request-schema';

describe('ChatRequestBodySchema', () => {
  it('rejects prefixed client-only chat identifiers', () => {
    const parsed = ChatRequestBodySchema.safeParse({
      id: 'learn-workspace-1-0-00000000-0000-0000-0000-000000000000',
      messages: [],
    });

    expect(parsed.success).toBe(false);
  });

  it('trims valid chat UUID identifiers', () => {
    const parsed = ChatRequestBodySchema.safeParse({
      id: ' 00000000-0000-0000-0000-000000000000 ',
      messages: [],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe('00000000-0000-0000-0000-000000000000');
    }
  });

  it('accepts credit workspace aliases before route normalization', () => {
    const parsed = ChatRequestBodySchema.safeParse({
      messages: [],
      creditSource: 'personal',
      creditWsId: 'personal',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.creditWsId).toBe('personal');
    }
  });

  it('trims credit workspace identifiers', () => {
    const parsed = ChatRequestBodySchema.safeParse({
      messages: [],
      creditWsId: ' 00000000-0000-0000-0000-000000000000 ',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.creditWsId).toBe(
        '00000000-0000-0000-0000-000000000000'
      );
    }
  });

  it('accepts sanitized task board context for Mira board chats', () => {
    const parsed = ChatRequestBodySchema.safeParse({
      messages: [],
      taskBoardContext: {
        workspaceId: ' workspace-1 ',
        workspaceName: ' Workspace One ',
        boardId: ' board-1 ',
        boardName: ' Launch Board ',
        selectedList: {
          id: ' list-1 ',
          name: ' To Do ',
          status: ' not_started ',
          position: 0,
        },
        lists: [
          {
            id: ' list-1 ',
            name: ' To Do ',
            status: ' not_started ',
            position: 0,
          },
        ],
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.taskBoardContext).toEqual({
        workspaceId: 'workspace-1',
        workspaceName: 'Workspace One',
        boardId: 'board-1',
        boardName: 'Launch Board',
        selectedList: {
          id: 'list-1',
          name: 'To Do',
          status: 'not_started',
          position: 0,
        },
        lists: [
          {
            id: 'list-1',
            name: 'To Do',
            status: 'not_started',
            position: 0,
          },
        ],
      });
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  getChatRailWorkspaces,
  getDefaultChatConversationScope,
  getPersonalChatWorkspace,
} from './chat-default-scope';

describe('getDefaultChatConversationScope', () => {
  it('defaults personal workspaces to personal conversations', () => {
    expect(getDefaultChatConversationScope({ personal: true })).toBe(
      'personal'
    );
  });

  it('defaults root and team workspaces to workspace conversations', () => {
    expect(getDefaultChatConversationScope({ personal: false })).toBe(
      'workspaces'
    );
    expect(getDefaultChatConversationScope({ personal: null })).toBe(
      'workspaces'
    );
  });

  it('keeps personal workspace available for the Personal tab but hides it from the workspace rail', () => {
    const workspaces = [
      { id: 'root', personal: false },
      { id: 'personal', personal: true },
      { id: 'team', personal: false },
    ];

    expect(getPersonalChatWorkspace(workspaces)?.id).toBe('personal');
    expect(
      getChatRailWorkspaces(workspaces).map((workspace) => workspace.id)
    ).toEqual(['root', 'team']);
  });
});

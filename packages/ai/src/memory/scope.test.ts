import { describe, expect, it } from 'vitest';
import { buildProductFilter, resolveAiMemoryScope } from './scope';

describe('resolveAiMemoryScope', () => {
  it('builds stable user workspace container tags and metadata', () => {
    const scope = resolveAiMemoryScope({
      customId: 'thread:abc/123',
      metadata: {
        conversationId: 'thread-abc',
        locale: 'en-US',
        timezone: 'Asia/Ho_Chi_Minh',
      },
      product: 'mira',
      source: '/dashboard/mira',
      surface: 'dashboard_chat',
      userId: 'user:1',
      wsId: 'workspace:1',
    });

    expect(scope).toMatchObject({
      containerTag: 'tuturuuu.user.user_1.workspace.workspace_1',
      customId: 'tuturuuu.mira.dashboard_chat.thread_abc_123',
      metadata: {
        conversationId: 'thread-abc',
        locale: 'en-US',
        product: 'mira',
        source: '/dashboard/mira',
        surface: 'dashboard_chat',
        timezone: 'Asia/Ho_Chi_Minh',
        userId: 'user:1',
        wsId: 'workspace:1',
      },
    });
  });

  it('returns null when the user or workspace boundary is missing', () => {
    expect(
      resolveAiMemoryScope({
        product: 'mira',
        surface: 'dashboard_chat',
        userId: 'user-1',
        wsId: null,
      })
    ).toBeNull();
  });

  it('builds product metadata filters for narrow route recall', () => {
    expect(buildProductFilter('tasks')).toEqual({
      filterType: 'metadata',
      key: 'product',
      value: 'tasks',
    });
  });
});

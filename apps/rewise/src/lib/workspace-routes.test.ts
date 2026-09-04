import { describe, expect, it } from 'vitest';
import { getRewiseChatPath, getRewiseWorkspacePath } from './workspace-routes';

describe('Rewise workspace routes', () => {
  it.each(['personal', '11111111-1111-4111-8111-111111111111'])(
    'keeps workspace %s in assistant navigation',
    (workspaceSlug) => {
      expect(getRewiseWorkspacePath(workspaceSlug, 'new')).toBe(
        `/${workspaceSlug}/new`
      );
      expect(getRewiseWorkspacePath(workspaceSlug, '/tools/')).toBe(
        `/${workspaceSlug}/tools`
      );
      expect(getRewiseChatPath(workspaceSlug, 'chat-1')).toBe(
        `/${workspaceSlug}/c/chat-1`
      );
    }
  );

  it('encodes unsafe dynamic segments', () => {
    expect(getRewiseChatPath('/personal/', 'chat with spaces')).toBe(
      '/personal/c/chat%20with%20spaces'
    );
    expect(getRewiseWorkspacePath('personal', 'tools/custom workflow')).toBe(
      '/personal/tools/custom%20workflow'
    );
  });
});

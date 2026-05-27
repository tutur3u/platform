import { describe, expect, it, vi } from 'vitest';
import { createChatPublicUrl } from './chat-public-url';

vi.mock('@/constants/common', () => ({
  CHAT_APP_URL: 'https://chat.tuturuuu.com',
}));

describe('createChatPublicUrl', () => {
  it('uses the request origin outside production for local app-session redirects', () => {
    const url = createChatPublicUrl(
      '/verify-token?token=abc',
      new Request('http://localhost:7821/login')
    );

    expect(url.toString()).toBe('http://localhost:7821/verify-token?token=abc');
  });
});

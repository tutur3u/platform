import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatPublicUrl } from './chat-public-url';

const context = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('@tuturuuu/start-bridge/request-context/core', () => ({
  maybeBridgeRequest: () => context.current,
}));

vi.mock('@/constants/common', () => ({
  CHAT_APP_URL: 'https://chat.tuturuuu.com',
}));

describe('createChatPublicUrl', () => {
  afterEach(() => {
    context.current = undefined;
    vi.unstubAllEnvs();
  });

  it('preserves the admitted apex mount in production redirects', () => {
    vi.stubEnv('NODE_ENV', 'production');
    context.current = {
      appBase: '/chat',
      request: new Request('https://tuturuuu.com/chat/login'),
    };
    expect(createChatPublicUrl('/verify-token?nextUrl=%2Fpersonal').href).toBe(
      'https://tuturuuu.com/chat/verify-token?nextUrl=%2Fpersonal'
    );
    expect(createChatPublicUrl('/chat/login').pathname).toBe('/chat/login');
    expect(createChatPublicUrl('/').href).toBe('https://tuturuuu.com/chat');
  });

  it('does not trust a raw mount header or an unknown production host', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      createChatPublicUrl(
        '/login',
        new Request('https://evil.test/chat', {
          headers: { 'x-tuturuuu-app-base': '/chat' },
        })
      ).href
    ).toBe('https://chat.tuturuuu.com/login');
  });

  it('keeps root-host redirects at the root in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    context.current = {
      appBase: '',
      request: new Request('https://chat.tuturuuu.com/login'),
    };
    expect(createChatPublicUrl('/verify-token').href).toBe(
      'https://chat.tuturuuu.com/verify-token'
    );
  });

  it('uses the request origin outside production for local app-session redirects', () => {
    const url = createChatPublicUrl(
      '/verify-token?token=abc',
      new Request('http://localhost:7821/login')
    );

    expect(url.toString()).toBe('http://localhost:7821/verify-token?token=abc');
  });
});

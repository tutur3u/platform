import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('connected chat migration widget', () => {
  it('exposes a truthful transport hook with dynamic page context', async () => {
    const response = GET();
    const source = await response.text();

    expect(response.headers.get('content-type')).toContain(
      'application/javascript'
    );
    expect(source).toContain('tuturuuu:connected-chat-send');
    expect(source).toContain('pageUrl: window.location.href');
    expect(source).toContain('Chat transport is not connected');
    expect(source).not.toContain('fetch(');
  });
});

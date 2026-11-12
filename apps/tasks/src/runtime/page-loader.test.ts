import { describe, expect, it, vi } from 'vitest';

const methods = vi.hoisted(() => [] as string[]);
vi.mock('@tanstack/react-start', () => ({
  createServerFn: ({ method }: { method: string }) => {
    methods.push(method);
    return { validator: () => ({ handler: (handler: unknown) => handler }) };
  },
}));

import { tasksPageInput } from './page-loader';

describe('Tasks page loader transport', () => {
  it('keeps route payloads out of GET query strings for both loaders', () => {
    expect(methods).toEqual(['POST', 'POST']);
  });

  it('retains bounded app-relative path validation', () => {
    expect(tasksPageInput.parse({ path: '/personal/boards/board-a' })).toEqual({
      path: '/personal/boards/board-a',
    });
    for (const path of [
      '//evil.example/path',
      'https://evil.example',
      'x',
      '/' + 'a'.repeat(8192),
    ]) {
      expect(tasksPageInput.safeParse({ path }).success).toBe(false);
    }
  });
});

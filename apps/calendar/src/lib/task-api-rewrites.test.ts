import { describe, expect, it } from 'vitest';
import { createTaskApiRewrites } from './task-api-rewrites';

describe('task API ownership', () => {
  it.each(['tasks', 'task-boards', 'boards-data', 'habits'])(
    'routes the %s API family directly to Tasks',
    (family) => {
      const source = `/api/v1/workspaces/:wsId/${family}/:path*`;
      expect(
        createTaskApiRewrites('https://tasks.example.com/')
      ).toContainEqual({
        source,
        destination: `https://tasks.example.com${source}`,
      });
    }
  );
  it.each([
    '/api/v1/workspaces/:wsId/tasks',
    '/api/v1/workspaces/:wsId/labels',
    '/api/v1/users/me/tasks',
  ])('preserves the collection path %s before wildcard matching', (source) => {
    const rewrites = createTaskApiRewrites('https://owner.example.com');
    const exact = rewrites.findIndex((route) => route.source === source);
    const nested = rewrites.findIndex(
      (route) => route.source === `${source}/:path*`
    );
    expect(exact).toBeGreaterThanOrEqual(0);
    expect(exact).toBeLessThan(nested);
    expect(rewrites[exact]?.destination).toBe(
      `https://owner.example.com${source}`
    );
  });
  it('does not redirect host-local authentication or unrelated workspace APIs', () => {
    const rewrites = createTaskApiRewrites('https://task.example.com');
    expect(rewrites.some((route) => route.source.startsWith('/api/auth'))).toBe(
      false
    );
    expect(rewrites.some((route) => route.source.includes('/wallets'))).toBe(
      false
    );
  });
  it('keeps workspace task preferences on the Tasks API owner', () => {
    const source = '/api/v1/users/me/workspaces/:wsId/configs/:path*';
    expect(createTaskApiRewrites('https://tasks.example.com')).toContainEqual({
      source,
      destination: `https://tasks.example.com${source}`,
    });
  });
});

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
  it('does not redirect host-local authentication or unrelated workspace APIs', () => {
    const rewrites = createTaskApiRewrites('https://task.example.com');
    expect(rewrites.some((route) => route.source.startsWith('/api/auth'))).toBe(
      false
    );
    expect(rewrites.some((route) => route.source.includes('/wallets'))).toBe(
      false
    );
  });
});

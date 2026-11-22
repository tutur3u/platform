// @vitest-environment node
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EXTERNAL_APP_ROUTES } from './rate-limit';

vi.mock('server-only', () => ({}));

const GROUP_DIR = join(
  __dirname,
  '../../legacy-api-routes/v1/workspaces/[wsId]/external-apps'
);
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

describe('external-app route limiter table', () => {
  it('matches every route module and the scopes it requires', async () => {
    const fromModules: Record<string, readonly string[]> = {};
    for (const file of routeFiles(GROUP_DIR)) {
      const route = relative(GROUP_DIR, file).split(sep).slice(0, -1).join('/');
      const module = (await import(file)) as Record<string, unknown> & {
        requiredScopes?: readonly string[];
      };
      expect(module.requiredScopes, route).toBeDefined();
      for (const method of METHODS) {
        if (typeof module[method] === 'function') {
          fromModules[`${method} ${route}`] = module.requiredScopes!;
        }
      }
    }

    expect(
      Object.fromEntries(
        Object.entries(EXTERNAL_APP_ROUTES).map(([key, { scopes }]) => [
          key,
          scopes,
        ])
      )
    ).toEqual(fromModules);
  });
});

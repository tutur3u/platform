import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: NextConfig) => config,
}));

const APP_ROOT = join(__dirname, '..', '..');
const REPO_ROOT = join(APP_ROOT, '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('playground stays out of public SEO surfaces', () => {
  it('is not listed in the shared SEO policy', () => {
    const policy = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'packages/utils/src/seo-policy.json'),
        'utf8'
      )
    ) as Record<string, unknown>;

    expect(policy).not.toHaveProperty('playground');
  });

  it('disallows crawling and marks every response noindex', async () => {
    expect(readFileSync(join(APP_ROOT, 'public/robots.txt'), 'utf8')).toBe(
      'User-agent: *\nDisallow: /\n'
    );

    const config = (await import('../../next.config')).default;
    const rules = (await config.headers?.()) ?? [];
    const robots = rules.filter((rule) =>
      rule.headers.some((header) => header.key === 'X-Robots-Tag')
    );

    expect(robots[0]?.source).toBe('/:path*');
    expect(robots[0]?.headers[0]?.value).toMatch(/noindex/);
  });
});

describe('playground AI routes do not write AI memory', () => {
  it('imports no memory or usage-writing helper', () => {
    const offenders = walk(join(APP_ROOT, 'src'))
      .filter((path) => /\.(?:ts|tsx)$/.test(path) && !/\.test\./.test(path))
      .filter(
        (path) =>
          !path.endsWith('staff-access.ts') &&
          /withAiMemory|@tuturuuu\/ai\/memory|ROOT_WORKSPACE_ID/.test(
            readFileSync(path, 'utf8')
          )
      );

    expect(offenders).toEqual([]);
  });
});

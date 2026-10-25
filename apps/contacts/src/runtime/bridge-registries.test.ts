// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
  planRegistries,
  type RegistryConfig,
} from '@tuturuuu/start-bridge/codegen';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../..');

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe('start-bridge registries', () => {
  const config = JSON.parse(
    readFileSync(join(appRoot, 'start-bridge.routes.json'), 'utf8')
  ) as RegistryConfig;
  const appDir = join(appRoot, config.appDir ?? 'src/app');
  const plan = planRegistries(
    config,
    walk(appDir).map((file) => relative(appDir, file).split(sep).join('/')),
    (path) => existsSync(join(appRoot, path))
  );

  it('registers every route and page', () => {
    expect(plan.errors).toEqual([]);
  });

  it('keeps the generated registries current (bun run routes:generate)', () => {
    expect(plan.generated.map((output) => output.path)).toEqual([
      'src/runtime/api-registry.bridge.gen.ts',
      'src/runtime/page-registry.bridge.gen.ts',
    ]);
    for (const output of plan.generated)
      expect(
        readFileSync(join(appRoot, output.path), 'utf8'),
        output.path
      ).toBe(output.content);
  });
});

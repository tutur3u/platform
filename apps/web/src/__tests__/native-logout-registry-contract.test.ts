import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exportedMethods,
  type RegistryConfig,
} from '@tuturuuu/start-bridge/codegen';
import { expect, it } from 'vitest';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);

it('keeps every active native lazy logout registry aligned with its route method exports', () => {
  const checked: string[] = [];
  for (const app of readdirSync(join(repoRoot, 'apps'), {
    withFileTypes: true,
  })) {
    if (
      !app.isDirectory() ||
      ['backend', 'tanstack-web', 'mobile'].includes(app.name)
    )
      continue;
    const appRoot = join(repoRoot, 'apps', app.name);
    const configPath = join(appRoot, 'start-bridge.routes.json');
    if (!existsSync(configPath)) continue;
    const config: RegistryConfig = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!config.api?.lazy || config.appDir === null) continue;
    const sourcePath = join(
      appRoot,
      config.appDir ?? 'src/app',
      'api/auth/logout/route.ts'
    );
    if (!existsSync(sourcePath)) continue;
    if (
      config.owned?.['api/auth/logout/route.ts'] ||
      config.ignored?.['api/auth/logout/route.ts']
    )
      continue;
    const registry = readFileSync(join(appRoot, config.api.out), 'utf8');
    const entry = registry
      .split('\n')
      .find((line) => /pattern:\s*['"]\/api\/auth\/logout['"]/.test(line));
    expect(entry, app.name).toBeDefined();
    if (!entry) throw new Error(`${app.name}: missing generated logout route`);
    const methodList = entry.match(/,\s*(\[[A-Z"',\s]*\])\s*\)/)?.[1];
    expect(methodList, app.name).toBeDefined();
    if (!methodList)
      throw new Error(`${app.name}: missing lazy logout methods`);
    const methods = exportedMethods(readFileSync(sourcePath, 'utf8'));
    expect(methods, app.name).toEqual(['GET', 'POST', 'OPTIONS']);
    expect(JSON.parse(methodList), app.name).toEqual(methods);
    checked.push(app.name);
  }
  expect(checked).toContain('calendar');
  expect(checked.length).toBeGreaterThan(0);
});

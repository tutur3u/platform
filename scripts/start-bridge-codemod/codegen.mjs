// Runs the bridge's own route-registry planner (`planRegistries`) against a
// planned config without writing, so dry-run shows the exact registry bytes
// the bridge codegen will produce. The planner is TypeScript, so it runs in a
// Bun subprocess; tests inject a fake instead.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BRIDGE_DIR } from './contract.mjs';
import { walk } from './inventory.mjs';

const PLANNER = `
const [registry, input] = [process.argv[1], await Bun.stdin.json()];
const { planRegistries } = await import(registry);
const exists = (relative) => input.existing.includes(relative);
// Runs in the app root: lazy registries read route sources for their methods.
const { readFileSync } = await import('node:fs');
const readSource = (relative) => readFileSync(relative, 'utf8');
const plan = planRegistries(input.config, input.files, exists, readSource);
console.log(JSON.stringify({ generated: plan.generated, errors: plan.errors }));
`;

export function createBunCodegen(repoRoot, options = {}) {
  const registry = path.join(repoRoot, BRIDGE_DIR, 'src/codegen/registry.ts');
  const run = options.spawn ?? spawnSync;
  return function planCodegen(appRoot, config) {
    if (!fs.existsSync(registry))
      return {
        generated: [],
        errors: [`${BRIDGE_DIR} codegen is not available at ${registry}`],
      };
    const appDir = config.appDir ?? 'src/app';
    const files = walk(path.join(appRoot, appDir));
    const owners = Object.values(config.owned ?? {});
    const existing = owners.filter((owner) =>
      fs.existsSync(path.join(appRoot, owner))
    );
    const result = run('bun', ['--eval', PLANNER, registry], {
      cwd: appRoot,
      input: JSON.stringify({ config, files, existing }),
      encoding: 'utf8',
      timeout: 30000,
    });
    if (result.status !== 0)
      return {
        generated: [],
        errors: [`bridge codegen failed: ${(result.stderr ?? '').trim()}`],
      };
    return JSON.parse(result.stdout);
  };
}

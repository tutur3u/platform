import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { resourceShims } from './resources-command';
import {
  assertBudgetSetupOwner,
  budgetLauncherProtocol,
} from './resources-compatibility';
import { atomicJson, defaultResourceConfig } from './resources-config';
import { installResourceShims, setupResources } from './resources-setup';
import { withAdmission } from './resources-slots';

const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0))
    await rm(home, { recursive: true, force: true });
});
async function home() {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'budget-rollout-')));
  homes.push(path);
  await atomicJson(join(path, 'config.json'), defaultResourceConfig());
  return path;
}
const absent = (path: string) =>
  readFile(path).then(
    () => false,
    () => true
  );
it('refuses old launcher owners before workload or setup can publish the fence', async () => {
  const path = await home();
  await installResourceShims(
    path,
    join(path, 'old-global/dist/cli/resources-entry.js')
  );
  for (const name of resourceShims) {
    const file = join(path, 'bin', name);
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(`${budgetLauncherProtocol}\n`, '')
    );
  }
  const before = await readFile(join(path, 'bin/node'), 'utf8');
  let ran = false;
  await expect(
    withAdmission(path, async () => {
      ran = true;
    })
  ).rejects.toThrow('Upgrade every global');
  await expect(
    setupResources({ home: path, roots: [], shell: 'none' })
  ).rejects.toThrow('Setup refuses a foreign older launcher');
  expect(ran).toBe(false);
  expect(await absent(join(path, 'slots/budget-v3'))).toBe(true);
  expect(await readFile(join(path, 'bin/node'), 'utf8')).toBe(before);
});
it('setup refreshes compatible launchers without publishing an admission fence', async () => {
  const path = await home();
  await setupResources({ home: path, roots: [path], shell: 'none' });
  expect(await absent(join(path, 'slots/budget-v3'))).toBe(true);
  expect(await readFile(join(path, 'bin/node'), 'utf8')).toContain(
    budgetLauncherProtocol
  );
  await withAdmission(path, async () => {});
  expect(await readFile(join(path, 'slots/budget-v3'), 'utf8')).toBe('3\n');
});
it('permits a verified same-global upgrade but refuses a consumer cache install', async () => {
  const path = await home();
  const install = join(path, 'user/.bun/install');
  const at = (v: string) =>
    join(
      install,
      `cache/links/tuturuuu@${v}/node_modules/tuturuuu/dist/cli/resources-entry.js`
    );
  for (const v of ['0.28.0+a', '0.29.0+b', '0.30.0+c']) {
    await mkdir(join(at(v), '..'), { recursive: true });
    await writeFile(at(v), '// fixture');
  }
  const modules = join(install, 'global/node_modules');
  await mkdir(modules, { recursive: true });
  await symlink(join(at('0.29.0+b'), '../../..'), join(modules, 'tuturuuu'));
  await installResourceShims(path, at('0.28.0+a'));
  for (const name of resourceShims) {
    const file = join(path, 'bin', name);
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(`${budgetLauncherProtocol}\n`, '')
    );
  }
  await expect(assertBudgetSetupOwner(path, at('0.29.0+b'))).resolves.toBe(
    true
  );
  await expect(assertBudgetSetupOwner(path, at('0.30.0+c'))).rejects.toThrow(
    'Setup refuses'
  );
  expect(await absent(join(path, 'slots/budget-v3'))).toBe(true);
});

it('requires an idle queue even when a same-install shim upgrade preserves the worker policy', async () => {
  const path = await home();
  const { resolve } = await import('node:path');
  const { newOwner } = await import('./resources-slots');
  await installResourceShims(path, resolve('src/cli/resources-entry.ts'));
  for (const name of resourceShims) {
    const file = join(path, 'bin', name);
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(`${budgetLauncherProtocol}\n`, '')
    );
  }
  const before = await readFile(join(path, 'bin/node'), 'utf8');
  await atomicJson(
    join(path, 'slots/0/owner.json'),
    newOwner('legacy-running')
  );
  await expect(
    setupResources({ home: path, roots: [], shell: 'none' })
  ).rejects.toThrow('drain');
  expect(await readFile(join(path, 'bin/node'), 'utf8')).toBe(before);
  expect(await absent(join(path, 'slots/budget-v3'))).toBe(true);
});

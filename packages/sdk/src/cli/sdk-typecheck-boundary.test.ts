import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { z } from 'zod';
import turbo from '../../../../turbo.json';
import packageJson from '../../package.json';

const sdk = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const compiler = join(
  dirname(require.resolve('typescript/package.json')),
  'bin/tsc'
);
const configResult = z.object({
  compilerOptions: z.record(z.string(), z.unknown()),
  files: z.array(z.string()),
});
function typecheckArgs() {
  const [command, ...args] = packageJson.scripts['type-check'].split(/\s+/);
  expect(command, 'Type-check must remain one compiler invocation').toBe('tsc');
  return args;
}
function runCompiler(args: string[]) {
  const result = spawnSync(process.execPath, [compiler, ...args], {
    cwd: sdk,
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (result.error) throw result.error;
  return result;
}
function resolvedConfig(args: string[]) {
  const result = runCompiler([...args, '--showConfig']);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return configResult.parse(JSON.parse(result.stdout));
}
it('keeps build source coverage and semantic options while removing the competing dist emitter', () => {
  const build = resolvedConfig(['--project', 'tsconfig.build.json']);
  const check = resolvedConfig(typecheckArgs());
  expect(check.files.length).toBeGreaterThan(0);
  expect([...check.files].sort()).toEqual([...build.files].sort());
  const semanticOptions = (options: typeof check.compilerOptions) =>
    Object.fromEntries(
      Object.entries(options).filter(
        ([key]) => !['noEmit', 'composite', 'incremental'].includes(key)
      )
    );
  expect(semanticOptions(check.compilerOptions)).toEqual(
    semanticOptions(build.compilerOptions)
  );
  expect(check.compilerOptions).toMatchObject({
    noEmit: true,
    composite: false,
    incremental: false,
  });
  expect(build.compilerOptions.noEmit).not.toBe(true);
  expect(build.compilerOptions.declaration).toBe(true);
  expect(build.compilerOptions.declarationMap).toBe(true);
  expect(turbo.tasks['type-check'].dependsOn).toContain('^build');
  const emitters = Object.entries({ build, 'type-check': check })
    .filter(
      ([, config]) =>
        config.compilerOptions.noEmit !== true &&
        resolve(sdk, String(config.compilerOptions.outDir)) ===
          join(sdk, 'dist')
    )
    .map(([task]) => task);
  expect(emitters).toEqual(['build']);
}, 30_000);
it('the owning type-check rejects invalid types and writes no output or incremental state', () => {
  const home = mkdtempSync(join(tmpdir(), 'sdk-noemit-'));
  const input = join(home, 'input.ts');
  const config = join(home, 'fixture.json');
  const args = typecheckArgs();
  const project = args.indexOf('--project');
  expect(project).toBeGreaterThanOrEqual(0);
  const base = args[project + 1];
  if (!base) throw new Error('Type-check project is missing');
  try {
    writeFileSync(
      config,
      JSON.stringify({
        extends: resolve(sdk, base),
        compilerOptions: {
          rootDir: home,
          outDir: join(home, 'dist'),
          types: [],
        },
        files: [input],
        include: [],
        exclude: [],
      })
    );
    const fixtureArgs = [...args];
    fixtureArgs[project + 1] = config;
    writeFileSync(input, 'export const value: string = 42;\n');
    const invalid = runCompiler(fixtureArgs);
    expect(invalid.status).not.toBe(0);
    expect(invalid.stdout + invalid.stderr).toContain('TS2322');
    expect(readdirSync(home).sort()).toEqual(['fixture.json', 'input.ts']);
    writeFileSync(input, "export const value: string = 'valid';\n");
    const valid = runCompiler(fixtureArgs);
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
    expect(readdirSync(home).sort()).toEqual(['fixture.json', 'input.ts']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}, 45_000);

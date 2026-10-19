import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// This test invokes only the CI compiler and emits declarations in a disposable
// fixture. The local compiler/build HOLD also applies to this regression.
it.runIf(process.env.CI === 'true')(
  'rebuilds missing declarations despite restored build info and tracks leaf config/source changes',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'meet-type-cache-'));
    const compiler = fileURLToPath(
      new URL('../../../../node_modules/.bin/tsc', import.meta.url)
    );
    const config = (name: string) => ({
      compilerOptions: {
        composite: true,
        declaration: true,
        emitDeclarationOnly: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        types: [],
        rootDir: '.',
        outDir: `../types/${name}`,
        tsBuildInfoFile: `../${name}.tsbuildinfo`,
        disableSourceOfProjectReferenceRedirect: true,
      },
      files: ['index.ts'],
      references: name === 'worker' ? [{ path: '../app' }] : [],
    });
    const writeConfig = (name: string, value: unknown) =>
      writeFileSync(join(root, name, 'tsconfig.json'), JSON.stringify(value));
    const build = () => {
      const result = spawnSync(
        compiler,
        ['--build', join(root, 'tsconfig.json')],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect({
        status: result.status,
        output: result.stdout + result.stderr,
      }).toEqual({ status: 0, output: '' });
    };
    try {
      for (const name of ['app', 'worker']) {
        mkdirSync(join(root, name));
        writeConfig(name, config(name));
      }
      writeFileSync(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          files: [],
          references: [{ path: './app' }, { path: './worker' }],
        })
      );
      const source = join(root, 'app/index.ts');
      writeFileSync(source, 'export const value = "first";\n');
      writeFileSync(
        join(root, 'worker/index.ts'),
        'export { value } from "../app/index";\n'
      );
      build();
      const declaration = join(root, 'types/app/index.d.ts');
      const initial = readFileSync(declaration, 'utf8');
      const appInfo = readFileSync(join(root, 'app.tsbuildinfo'));
      const workerInfo = readFileSync(join(root, 'worker.tsbuildinfo'));

      // Simulate a cache that restored build info without its declaration tree.
      rmSync(join(root, 'types'), { recursive: true });
      writeFileSync(join(root, 'app.tsbuildinfo'), appInfo);
      writeFileSync(join(root, 'worker.tsbuildinfo'), workerInfo);
      build();
      expect(readFileSync(declaration, 'utf8')).toBe(initial);
      expect(existsSync(join(root, 'types/worker/index.d.ts'))).toBe(true);

      writeFileSync(source, 'export const value = "second";\n');
      const nextTime = new Date(Date.now() + 1000);
      utimesSync(source, nextTime, nextTime);
      build();
      expect(readFileSync(declaration, 'utf8')).toContain('"second"');

      const changed = config('app');
      writeConfig('app', {
        ...changed,
        compilerOptions: { ...changed.compilerOptions, declarationMap: true },
      });
      utimesSync(join(root, 'app/tsconfig.json'), nextTime, nextTime);
      build();
      expect(existsSync(`${declaration}.map`)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
);

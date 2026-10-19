import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { runWithDeclarationCache } from '../../scripts/type-check.cjs';

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
      files: name === 'app' ? ['index.ts', 'companion.ts'] : ['index.ts'],
      references: name === 'worker' ? [{ path: '../app' }] : [],
    });
    const writeConfig = (name: string, value: unknown) =>
      writeFileSync(join(root, name, 'tsconfig.json'), JSON.stringify(value));
    const projects = ['app', 'worker'].map((name) => ({
      output: `types/${name}`,
      info: `${name}.tsbuildinfo`,
    }));
    let rawInfos: Buffer[] = [];
    const compile = () =>
      spawnSync(compiler, ['--build', join(root, 'tsconfig.json')], {
        encoding: 'utf8',
      });
    const build = (metadataPresent?: boolean[]) => {
      expect(
        runWithDeclarationCache({
          cwd: root,
          projects,
          manifest: 'types/outputs.json',
          compile: () => {
            if (metadataPresent)
              expect(
                projects.map(({ info }) => existsSync(join(root, info)))
              ).toEqual(metadataPresent);
            const result = compile();
            expect(result.error).toBeUndefined();
            expect({
              status: result.status,
              output: result.stdout + result.stderr,
            }).toEqual({ status: 0, output: '' });
            if (result.status === 0)
              rawInfos = projects.map(({ info }) =>
                readFileSync(join(root, info))
              );
            return result.status ?? 1;
          },
        })
      ).toBe(0);
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
        join(root, 'app/companion.ts'),
        'export const companion = true;\n'
      );
      writeFileSync(
        join(root, 'worker/index.ts'),
        'export { value } from "../app/index";\n'
      );
      build([false, false]);
      build([true, true]);
      const declaration = join(root, 'types/app/index.d.ts');
      const initial = readFileSync(declaration, 'utf8');
      const [appInfo, workerInfo] = rawInfos;
      if (!appInfo || !workerInfo)
        throw new Error('Missing actual compiler producer metadata');
      expect(readFileSync(join(root, 'app.tsbuildinfo'))).toEqual(appInfo);
      expect(readFileSync(join(root, 'worker.tsbuildinfo'))).toEqual(
        workerInfo
      );

      // Simulate a cache that restored build info without its declaration tree.
      rmSync(join(root, 'types'), { recursive: true });
      writeFileSync(join(root, 'app.tsbuildinfo'), appInfo);
      writeFileSync(join(root, 'worker.tsbuildinfo'), workerInfo);
      // Negative control: bare incremental tsc reproduces the actual CI defect.
      const broken = compile();
      expect(broken.status).toBe(2);
      expect(broken.stdout + broken.stderr).toContain('TS6305');
      writeFileSync(join(root, 'app.tsbuildinfo'), appInfo);
      writeFileSync(join(root, 'worker.tsbuildinfo'), workerInfo);
      build([false, false]);
      expect(readFileSync(declaration, 'utf8')).toBe(initial);
      expect(existsSync(join(root, 'types/worker/index.d.ts'))).toBe(true);

      // V362 counterexample: omit the lost declaration from an otherwise valid,
      // nonempty receipt; the independent successful producer still requires it.
      const receiptPath = join(root, 'types/outputs.json');
      const receipts = z
        .array(
          z.object({
            output: z.string(),
            files: z.array(z.string()),
            producer: z.string(),
          })
        )
        .parse(JSON.parse(readFileSync(receiptPath, 'utf8')));
      const appReceipt = receipts.find(({ output }) => output === 'types/app');
      if (!appReceipt) throw new Error('Missing app producer receipt');
      appReceipt.files = appReceipt.files.filter(
        (file) => file !== 'types/app/index.d.ts'
      );
      expect(appReceipt.files).toContain('types/app/companion.d.ts');
      writeFileSync(receiptPath, JSON.stringify(receipts));
      rmSync(declaration);
      build([false, false]);
      expect(readFileSync(declaration, 'utf8')).toBe(initial);

      // A receipt must detect partial losses, and only dependents are invalidated.
      rmSync(declaration);
      build([false, false]);
      rmSync(join(root, 'types/worker/index.d.ts'));
      build([true, false]);
      writeFileSync(join(root, 'foreign.tsbuildinfo'), 'foreign');
      writeFileSync(join(root, 'types/outputs.json'), '{invalid');
      build([false, false]);
      expect(readFileSync(join(root, 'foreign.tsbuildinfo'), 'utf8')).toBe(
        'foreign'
      );

      const oldProducerReceipt = readFileSync(receiptPath);
      const producerPath = join(root, 'types/producers.json');
      const oldProducerState = readFileSync(producerPath);
      const oldNativeInfo = readFileSync(join(root, 'app.tsbuildinfo'));
      writeFileSync(source, 'export const value = "second";\n');
      const nextTime = new Date(Date.now() + 1000);
      utimesSync(source, nextTime, nextTime);
      build();
      expect(readFileSync(declaration, 'utf8')).toContain('"second"');
      expect(readFileSync(join(root, 'app.tsbuildinfo'))).not.toEqual(
        oldNativeInfo
      );
      // Both old receipt and old producer still agree with each other, but not
      // with the genuine newer raw metadata produced by the preceding build.
      writeFileSync(receiptPath, oldProducerReceipt);
      writeFileSync(producerPath, oldProducerState);
      build([false, false]);
      expect(readFileSync(declaration, 'utf8')).toContain('"second"');

      const changed = config('app');
      writeConfig('app', {
        ...changed,
        compilerOptions: { ...changed.compilerOptions, declarationMap: true },
      });
      utimesSync(join(root, 'app/tsconfig.json'), nextTime, nextTime);
      build([true, true]);
      expect(existsSync(`${declaration}.map`)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
);

it('does not preserve a success receipt on failure or delete metadata through symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'meet-type-cache-fence-'));
  const projects = [{ output: 'types/app', info: 'app.tsbuildinfo' }];
  const options = { cwd: root, projects, manifest: 'types/outputs.json' };
  try {
    mkdirSync(join(root, 'types/app'), { recursive: true });
    writeFileSync(join(root, 'types/app/index.d.ts'), 'export {};');
    expect(
      runWithDeclarationCache({
        ...options,
        compile: () => {
          writeFileSync(
            join(root, 'app.tsbuildinfo'),
            'fixture producer bytes'
          );
          return 0;
        },
      })
    ).toBe(0);
    expect(existsSync(join(root, 'types/outputs.json'))).toBe(true);
    writeFileSync(join(root, 'app.tsbuildinfo'), 'owned');
    expect(runWithDeclarationCache({ ...options, compile: () => 2 })).toBe(2);
    expect(existsSync(join(root, 'types/outputs.json'))).toBe(false);
    expect(existsSync(join(root, 'types/producers.json'))).toBe(false);
    writeFileSync(join(root, 'app.tsbuildinfo'), 'retained');
    symlinkSync(join(root, 'not-created'), join(root, 'types/app/linked'));
    let called = false;
    expect(() =>
      runWithDeclarationCache({
        ...options,
        compile: () => {
          called = true;
          return 0;
        },
      })
    ).toThrow('symlinks');
    expect(called).toBe(false);
    expect(readFileSync(join(root, 'app.tsbuildinfo'), 'utf8')).toBe(
      'retained'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

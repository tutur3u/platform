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

// Every compiler case owns its cold fixture; CI alone executes native tsc.
function projectFixture(root: string) {
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
  const compile = () =>
    spawnSync(compiler, ['--build', join(root, 'tsconfig.json')], {
      encoding: 'utf8',
    });
  const build = (metadataPresent: boolean[]) => {
    let calls = 0;
    let nativeInfos: Buffer[] = [];
    expect(
      runWithDeclarationCache({
        cwd: root,
        projects,
        manifest: 'types/outputs.json',
        compile: () => {
          calls++;
          expect(
            projects.map(({ info }) => existsSync(join(root, info)))
          ).toEqual(metadataPresent);
          const result = compile();
          expect(result.error).toBeUndefined();
          expect({
            status: result.status,
            output: result.stdout + result.stderr,
          }).toEqual({ status: 0, output: '' });
          nativeInfos = projects.map(({ info }) =>
            readFileSync(join(root, info))
          );
          return result.status ?? 1;
        },
      })
    ).toBe(0);
    expect(calls).toBe(1);
    projects.forEach(({ info }, index) => {
      expect(readFileSync(join(root, info))).toEqual(nativeInfos[index]);
    });
  };
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
  const declaration = join(root, 'types/app/index.d.ts');
  writeFileSync(source, 'export const value = "first";\n');
  writeFileSync(
    join(root, 'app/companion.ts'),
    'export const companion = true;\n'
  );
  writeFileSync(
    join(root, 'worker/index.ts'),
    'export { value } from "../app/index";\n'
  );
  return {
    root,
    source,
    declaration,
    build,
    compile,
    config,
    writeConfig,
    receiptPath: join(root, 'types/outputs.json'),
    producerPath: join(root, 'types/producers.json'),
  };
}

function withProjectFixture(
  assertions: (fixture: ReturnType<typeof projectFixture>) => void
) {
  const root = mkdtempSync(join(tmpdir(), 'meet-type-cache-'));
  try {
    const fixture = projectFixture(root);
    fixture.build([false, false]);
    assertions(fixture);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const compilerCase = it.runIf(process.env.CI === 'true');

compilerCase(
  'preserves healthy warm metadata and native compiler bytes',
  () => {
    withProjectFixture(({ root, declaration, build }) => {
      const initial = readFileSync(declaration, 'utf8');
      const appInfo = readFileSync(join(root, 'app.tsbuildinfo'));
      build([true, true]);
      expect(readFileSync(declaration, 'utf8')).toBe(initial);
      expect(readFileSync(join(root, 'app.tsbuildinfo'))).toEqual(appInfo);
    });
  }
);

compilerCase(
  'recovers missing declarations with retained info after bare tsc reproduces TS6305',
  () => {
    withProjectFixture(({ root, declaration, build, compile }) => {
      const initial = readFileSync(declaration, 'utf8');
      const appInfo = readFileSync(join(root, 'app.tsbuildinfo'));
      const workerInfo = readFileSync(join(root, 'worker.tsbuildinfo'));
      rmSync(join(root, 'types'), { recursive: true });
      const broken = compile();
      expect(broken.error).toBeUndefined();
      expect(broken.status).toBe(2);
      expect(broken.stdout + broken.stderr).toContain('TS6305');
      writeFileSync(join(root, 'app.tsbuildinfo'), appInfo);
      writeFileSync(join(root, 'worker.tsbuildinfo'), workerInfo);
      build([false, false]);
      expect(readFileSync(declaration, 'utf8')).toBe(initial);
      expect(existsSync(join(root, 'types/worker/index.d.ts'))).toBe(true);
    });
  }
);

compilerCase(
  'rejects a nonempty receipt omitting its missing declaration',
  () => {
    withProjectFixture(({ declaration, receiptPath, build }) => {
      const initial = readFileSync(declaration, 'utf8');
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
    });
  }
);

compilerCase(
  'recovers a missing app output with an intact producer and receipt',
  () => {
    withProjectFixture(({ declaration, build }) => {
      const initial = readFileSync(declaration, 'utf8');
      rmSync(declaration);
      build([false, false]);
      expect(readFileSync(declaration, 'utf8')).toBe(initial);
    });
  }
);

compilerCase(
  'recovers Worker-only loss while preserving warm app metadata',
  () => {
    withProjectFixture(({ root, build }) => {
      const appInfo = readFileSync(join(root, 'app.tsbuildinfo'));
      const workerDeclaration = join(root, 'types/worker/index.d.ts');
      const initial = readFileSync(workerDeclaration, 'utf8');
      rmSync(workerDeclaration);
      build([true, false]);
      expect(readFileSync(join(root, 'app.tsbuildinfo'))).toEqual(appInfo);
      expect(readFileSync(workerDeclaration, 'utf8')).toBe(initial);
    });
  }
);

compilerCase(
  'rejects malformed qualification without deleting foreign metadata',
  () => {
    withProjectFixture(({ root, receiptPath, build }) => {
      writeFileSync(join(root, 'foreign.tsbuildinfo'), 'foreign');
      writeFileSync(receiptPath, '{invalid');
      build([false, false]);
      expect(readFileSync(join(root, 'foreign.tsbuildinfo'), 'utf8')).toBe(
        'foreign'
      );
    });
  }
);

compilerCase(
  'tracks source changes and rejects an old agreeing producer pair against newer native metadata',
  () => {
    withProjectFixture(
      ({ root, source, declaration, receiptPath, producerPath, build }) => {
        const oldReceipt = readFileSync(receiptPath);
        const oldProducer = readFileSync(producerPath);
        const oldInfo = readFileSync(join(root, 'app.tsbuildinfo'));
        writeFileSync(source, 'export const value = "second";\n');
        const nextTime = new Date(Date.now() + 1000);
        utimesSync(source, nextTime, nextTime);
        build([true, true]);
        expect(readFileSync(declaration, 'utf8')).toContain('"second"');
        expect(readFileSync(join(root, 'app.tsbuildinfo'))).not.toEqual(
          oldInfo
        );
        writeFileSync(receiptPath, oldReceipt);
        writeFileSync(producerPath, oldProducer);
        build([false, false]);
        expect(readFileSync(declaration, 'utf8')).toContain('"second"');
      }
    );
  }
);

compilerCase(
  'tracks leaf config changes with healthy retained metadata',
  () => {
    withProjectFixture(({ root, declaration, config, writeConfig, build }) => {
      const changed = config('app');
      writeConfig('app', {
        ...changed,
        compilerOptions: { ...changed.compilerOptions, declarationMap: true },
      });
      const nextTime = new Date(Date.now() + 1000);
      utimesSync(join(root, 'app/tsconfig.json'), nextTime, nextTime);
      build([true, true]);
      expect(existsSync(`${declaration}.map`)).toBe(true);
    });
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

it('rejects escaped metadata paths before compiler launch or foreign deletion', () => {
  const root = mkdtempSync(join(tmpdir(), 'meet-type-scope-fence-'));
  let calls = 0;
  try {
    const cwd = join(root, 'owner');
    mkdirSync(cwd);
    writeFileSync(join(root, 'foreign.tsbuildinfo'), 'foreign');
    expect(() =>
      runWithDeclarationCache({
        cwd,
        projects: [{ output: 'types/app', info: '../foreign.tsbuildinfo' }],
        manifest: 'types/outputs.json',
        compile: () => {
          calls++;
          return 0;
        },
      })
    ).toThrow('Type cache path escapes project');
    expect(calls).toBe(0);
    expect(readFileSync(join(root, 'foreign.tsbuildinfo'), 'utf8')).toBe(
      'foreign'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('rejects compiler success without declaration outputs instead of publishing healthy qualification', () => {
  const root = mkdtempSync(join(tmpdir(), 'meet-type-empty-output-'));
  let calls = 0;
  try {
    expect(() =>
      runWithDeclarationCache({
        cwd: root,
        projects: [{ output: 'types/app', info: 'app.tsbuildinfo' }],
        manifest: 'types/outputs.json',
        compile: () => {
          calls++;
          writeFileSync(
            join(root, 'app.tsbuildinfo'),
            'fixture native metadata'
          );
          return 0;
        },
      })
    ).toThrow('Successful type check did not produce owned declarations');
    expect(calls).toBe(1);
    expect(existsSync(join(root, 'types/outputs.json'))).toBe(false);
    expect(existsSync(join(root, 'types/producers.json'))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

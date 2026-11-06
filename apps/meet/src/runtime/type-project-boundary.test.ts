import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { manifest, projects } from '../../scripts/type-check.cjs';

const projectSchema = z.object({
  compilerOptions: z.object({
    types: z.array(z.string()),
    lib: z.array(z.string()).optional(),
    emitDeclarationOnly: z.boolean(),
    outDir: z.string(),
    tsBuildInfoFile: z.string(),
    disableSourceOfProjectReferenceRedirect: z.boolean().optional(),
  }),
  include: z.array(z.string()),
  references: z.array(z.object({ path: z.string() })).optional(),
});
type Project = z.infer<typeof projectSchema>;

function boundaryErrors(app: Project, worker: Project) {
  const errors: string[] = [];
  if (app.compilerOptions.types.some((name) => name.includes('cloudflare')))
    errors.push('Workers globals must not enter the DOM app project');
  if (
    worker.compilerOptions.lib?.some((name) =>
      name.toLowerCase().includes('dom')
    )
  )
    errors.push('DOM globals must not enter the Worker project');
  if (!worker.compilerOptions.types.includes('@cloudflare/workers-types'))
    errors.push('Worker runtime types must remain checked');
  for (const source of [
    'cloudflare-env.d.ts',
    'cloudflare/worker.ts',
    'cloudflare/live/session.ts',
    'cloudflare/provider.ts',
  ])
    if (!worker.include.includes(source))
      errors.push(`Worker coverage missing: ${source}`);
  if (
    !worker.references?.some(({ path }) => path === './tsconfig.app.json') ||
    !worker.compilerOptions.disableSourceOfProjectReferenceRedirect
  )
    errors.push('Worker must consume the checked app declarations');
  if (
    !app.compilerOptions.emitDeclarationOnly ||
    !worker.compilerOptions.emitDeclarationOnly
  )
    errors.push('Type solution must emit declarations only');
  if (
    app.compilerOptions.tsBuildInfoFile !== '.turbo/tsconfig.tsbuildinfo' ||
    worker.compilerOptions.tsBuildInfoFile !== 'dist/tsconfig.tsbuildinfo'
  )
    errors.push(
      'Build info must use existing cache-wrapper invalidation paths'
    );
  return errors;
}

function project(file: string) {
  return projectSchema.parse(
    JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))
  );
}

describe('native app and Worker type boundaries', () => {
  it('sets explicit solution and leaf host type scopes and JSON roots', () => {
    const solution = z
      .object({
        files: z.array(z.string()),
        compilerOptions: z.object({ types: z.array(z.string()) }),
      })
      .parse(
        JSON.parse(
          readFileSync(new URL('../../tsconfig.json', import.meta.url), 'utf8')
        )
      );
    expect(solution.files).toEqual([]);
    expect(solution.compilerOptions.types).toEqual([]);
    expect(project('tsconfig.app.json').compilerOptions.types).toEqual([
      'vite/client',
      'node',
    ]);
    expect(project('tsconfig.cloudflare.json').compilerOptions.types).toEqual([
      '@cloudflare/workers-types',
      'node',
    ]);
    expect(project('tsconfig.app.json').include).toEqual(
      expect.arrayContaining([
        'messages/en.json',
        'messages/vi.json',
        'src/routes',
        'src/routeTree.gen.ts',
      ])
    );
    const pkg = z
      .object({ scripts: z.record(z.string(), z.string()) })
      .parse(
        JSON.parse(
          readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
        )
      );
    expect(pkg.scripts['type-check']).toBe(
      'node scripts/type-check.cjs && bun run type-check:config'
    );
    expect(pkg.scripts['cf:typecheck']).toBe('node scripts/type-check.cjs');
  });

  it('keeps both real projects checked without mixing Worker and browser globals', () => {
    expect(
      boundaryErrors(
        project('tsconfig.app.json'),
        project('tsconfig.cloudflare.json')
      )
    ).toEqual([]);
  });

  it('checks browser transport in its DOM owner while selecting only portable Worker suppliers', () => {
    const worker = project('tsconfig.cloudflare.json');
    expect(worker.include).toContain(
      '../../packages/realtime/src/collaboration/server.ts'
    );
    expect(worker.include).not.toContain(
      '../../packages/realtime/src/collaboration/index.ts'
    );
    expect(worker.include).not.toContain(
      '../../packages/realtime/src/collaboration/client.ts'
    );
    const browser = z
      .object({ extends: z.string(), include: z.array(z.string()) })
      .parse(
        JSON.parse(
          readFileSync(
            new URL(
              '../../../../packages/realtime/tsconfig.typecheck.json',
              import.meta.url
            ),
            'utf8'
          )
        )
      );
    expect(browser.extends).toBe('@tuturuuu/typescript-config/typecheck.json');
    expect(browser.include).toContain('src');
    const host = z
      .object({ compilerOptions: z.object({ lib: z.array(z.string()) }) })
      .parse(
        JSON.parse(
          readFileSync(
            new URL(
              '../../../../packages/typescript-config/typecheck.json',
              import.meta.url
            ),
            'utf8'
          )
        )
      );
    expect(host.compilerOptions.lib).toContain('DOM');
    for (const name of [
      'channel-room-do.ts',
      'collaboration-room-do.ts',
      'collaboration-worker.ts',
    ]) {
      const source = readFileSync(
        new URL(`../../../meet-realtime/src/${name}`, import.meta.url),
        'utf8'
      );
      expect(source).toContain("'@tuturuuu/realtime/collaboration/server'");
      expect(source).not.toContain(
        "'../../../packages/realtime/src/collaboration'"
      );
    }
  });

  it('rejects the global Worker declarations that caused Response and Element collisions', () => {
    const app = project('tsconfig.app.json');
    app.compilerOptions.types.push('@cloudflare/workers-types');
    expect(boundaryErrors(app, project('tsconfig.cloudflare.json'))).toContain(
      'Workers globals must not enter the DOM app project'
    );
  });

  it('rejects missing generated binding/Live roots and unverified app source redirects', () => {
    const worker = project('tsconfig.cloudflare.json');
    worker.include = worker.include.filter(
      (file) =>
        file !== 'cloudflare-env.d.ts' && file !== 'cloudflare/live/session.ts'
    );
    worker.compilerOptions.disableSourceOfProjectReferenceRedirect = false;
    expect(boundaryErrors(project('tsconfig.app.json'), worker)).toEqual([
      'Worker coverage missing: cloudflare-env.d.ts',
      'Worker coverage missing: cloudflare/live/session.ts',
      'Worker must consume the checked app declarations',
    ]);
  });

  it('caches both declaration projects together with inherited build info and inputs', () => {
    const app = project('tsconfig.app.json');
    const worker = project('tsconfig.cloudflare.json');
    expect(app.compilerOptions.outDir).toBe('.turbo/types/app');
    expect(worker.compilerOptions.outDir).toBe('.turbo/types/worker');
    expect(projects).toEqual(
      [app, worker].map(({ compilerOptions }) => ({
        output: compilerOptions.outDir,
        info: compilerOptions.tsBuildInfoFile,
      }))
    );
    expect(manifest).toBe('.turbo/types/outputs.json');
    const configuration = z
      .object({
        extends: z.array(z.string()),
        tasks: z.object({
          'type-check': z.object({ outputs: z.array(z.string()) }).strict(),
        }),
      })
      .parse(
        JSON.parse(
          readFileSync(new URL('../../turbo.json', import.meta.url), 'utf8')
        )
      );
    expect(configuration.extends).toEqual(['//']);
    expect(configuration.tasks['type-check'].outputs).toEqual([
      '$TURBO_EXTENDS$',
      '.turbo/types/**',
    ]);
    const root = z
      .object({
        tasks: z.object({
          'type-check': z.object({
            outputs: z.array(z.string()),
            inputs: z.array(z.string()),
            dependsOn: z.array(z.string()),
          }),
        }),
      })
      .parse(
        JSON.parse(
          readFileSync(
            new URL('../../../../turbo.json', import.meta.url),
            'utf8'
          )
        )
      );
    expect(root.tasks['type-check'].outputs).toEqual(
      expect.arrayContaining([
        '.turbo/*.tsbuildinfo',
        'dist/*.tsbuildinfo',
        '.turbo/tsc-build-cache-key.json',
      ])
    );
    expect(root.tasks['type-check'].inputs).toContain('$TURBO_DEFAULT$');
    expect(root.tasks['type-check'].dependsOn).toEqual(
      expect.arrayContaining(['^build', '^type-check'])
    );
  });
});

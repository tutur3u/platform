import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

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
  it('keeps both real projects checked without mixing Worker and browser globals', () => {
    expect(
      boundaryErrors(
        project('tsconfig.app.json'),
        project('tsconfig.cloudflare.json')
      )
    ).toEqual([]);
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

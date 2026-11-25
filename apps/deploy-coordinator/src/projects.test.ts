import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CI_OBJECT } from './ci-registry';
import {
  CI_REGISTRATION_WORKFLOW,
  ENVIRONMENTS,
  findProject,
  PROJECTS,
  WEB_FAMILIES,
  workflowFiles,
} from './projects';

const workflows = fileURLToPath(
  new URL('../../../.github/workflows/', import.meta.url)
);
const read = (file: string) => readFileSync(`${workflows}${file}`, 'utf8');

describe('project catalog', () => {
  // The cost ceiling in the deployment coordinator design scales with this
  // count; growing the catalog is a reviewed change to that figure.
  it('pins the catalog size and unique ids', () => {
    expect(PROJECTS).toHaveLength(51);
    expect(new Set(PROJECTS.map((project) => project.id)).size).toBe(51);
  });

  it('keeps the CI registry apart from every project environment', () => {
    const names = PROJECTS.flatMap((project) =>
      ENVIRONMENTS.map((environment) => `${project.id}:${environment}`)
    );
    expect(names).not.toContain(CI_OBJECT);
    expect(findProject(CI_OBJECT.split(':')[0]!)).toBeUndefined();
  });

  it('binds CI registration to a main push workflow that registers', () => {
    const source = read(CI_REGISTRATION_WORKFLOW);
    expect(source).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m);
    expect(source).toMatch(/^ {6}id-token: write$/m);
    expect(source).toContain('node scripts/ci/ci-register.mjs');
  });

  it('allowlists only workflow files that exist', () => {
    for (const project of PROJECTS)
      for (const environment of ENVIRONMENTS)
        for (const rule of project.workflows[environment])
          for (const workflow of workflowFiles(rule))
            expect(existsSync(`${workflows}${workflow}`), workflow).toBe(true);
  });

  it('binds the shared staging publisher to a caller that runs it for the app', () => {
    let bound = 0;
    for (const project of PROJECTS)
      for (const rule of project.workflows.staging) {
        // Staging reports only from the shared publisher, so the token's sha
        // is the pushed main commit it publishes.
        expect(typeof rule, project.id).toBe('object');
        if (typeof rule === 'string') continue;
        expect(rule.reusable).toBe('wave1-native-publish.yaml');
        expect(read(rule.caller), project.id).toMatch(
          new RegExp(
            `uses: \\./\\.github/workflows/wave1-native-publish\\.yaml\\s+with:\\s+app: ${project.id}\\s+profile: staging`
          )
        );
        bound += 1;
      }
    expect(bound).toBe(3);
  });

  it('lists production publishers only, and each one reports', () => {
    for (const project of PROJECTS)
      for (const rule of project.workflows.production) {
        const file = typeof rule === 'string' ? rule : rule.reusable;
        const source = read(file);
        // A job gated on the production ref that runs in a protected
        // GitHub Environment: the publisher, not a qualification build.
        expect(source, file).toMatch(
          /^\s+if:.*github\.ref == 'refs\/heads\/production'/m
        );
        expect(source, file).toMatch(/^\s+environment:/m);
        // Listing a workflow that never calls the coordinator is dead wiring.
        for (const phase of ['begin', 'finish'])
          expect(source, `${file} ${phase}`).toMatch(
            new RegExp(
              `uses: \\./\\.github/actions/deploy-coordinator\\s+with:\\s+phase: ${phase}`
            )
          );
      }
  });

  it('runs each reusable production publisher from its listed caller', () => {
    for (const project of PROJECTS)
      for (const rule of project.workflows.production) {
        if (typeof rule === 'string' || rule.caller === rule.reusable) continue;
        const caller = read(rule.caller);
        if (rule.caller === 'vercel-production.yaml') {
          // The planner reaches wave-1 uploads through the app's workflow.
          expect(caller, project.id).toContain(
            `uses: ./.github/workflows/${project.id}-cloudflare.yaml`
          );
          expect(read(`${project.id}-cloudflare.yaml`), project.id).toContain(
            `uses: ./.github/workflows/${rule.reusable}`
          );
        } else {
          expect(caller, project.id).toMatch(
            new RegExp(
              `uses: \\./\\.github/workflows/${rule.reusable.replace('.', '\\.')}[\\s\\S]*?app: ${project.id}\\b`
            )
          );
        }
      }
  });

  it('gives every Web OpenNext family its own production project', () => {
    const families = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            '../../web/cloudflare/opennext/families.json',
            import.meta.url
          )
        ),
        'utf8'
      )
    ) as { families: { id: string }[] };
    expect([...WEB_FAMILIES].sort()).toEqual(
      families.families.map((family) => family.id).sort()
    );
  });

  it('lists no preview reporters', () => {
    // Cloudflare Worker previews run on pull request events, which the
    // coordinator rejects, so no workflow reports a preview.
    for (const project of PROJECTS)
      expect(project.workflows.preview, project.id).toEqual([]);
  });

  // wave1-web-staging.yaml publishes a dispatched source_sha that can differ
  // from the token's commit, so apps/web staging is not reportable.
  it('does not report platform staging from the dispatched web publisher', () => {
    expect(findProject('platform')?.workflows.staging).toEqual([]);
  });
});

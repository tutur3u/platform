import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS, findProject, PROJECTS, workflowFiles } from './projects';

const workflows = fileURLToPath(
  new URL('../../../.github/workflows/', import.meta.url)
);
const read = (file: string) => readFileSync(`${workflows}${file}`, 'utf8');

describe('project catalog', () => {
  // The cost ceiling in the deployment coordinator design scales with this
  // count; growing the catalog is a reviewed change to that figure.
  it('pins the catalog size and unique ids', () => {
    expect(PROJECTS).toHaveLength(33);
    expect(new Set(PROJECTS.map((project) => project.id)).size).toBe(33);
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

  it('lists production publishers only', () => {
    for (const project of PROJECTS)
      for (const rule of project.workflows.production) {
        expect(typeof rule).toBe('string');
        const source = read(String(rule));
        // A job gated on the production ref that runs in a protected
        // GitHub Environment: the publisher, not a qualification build.
        expect(source, String(rule)).toMatch(
          /^\s+if:.*github\.ref == 'refs\/heads\/production'/m
        );
        expect(source, String(rule)).toMatch(/^\s+environment:/m);
      }
  });

  it('routes previews through dispatch-only preview workflows', () => {
    for (const project of PROJECTS)
      for (const rule of project.workflows.preview) {
        const workflow = String(rule);
        expect(typeof rule).toBe('string');
        const source = read(workflow);
        expect(source, workflow).toMatch(/preview_ref:/);
        expect(source, workflow).not.toMatch(/^\s+pull_request/m);
      }
    // Cloudflare Worker previews run on pull request events, which the
    // coordinator rejects; the only previews listed are Vercel dispatches.
    for (const project of PROJECTS)
      for (const rule of project.workflows.preview)
        expect(String(rule), project.id).toMatch(/^vercel-preview-/);
  });

  // wave1-web-staging.yaml publishes a dispatched source_sha that can differ
  // from the token's commit, so apps/web staging is not reportable.
  it('does not report platform staging from the dispatched web publisher', () => {
    expect(findProject('platform')?.workflows.staging).toEqual([]);
  });
});

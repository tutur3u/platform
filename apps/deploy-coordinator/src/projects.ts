// The catalog bounds which Durable Objects can exist: every addressable object
// is one catalog project environment. Adding a project is a reviewed change.

export const ENVIRONMENTS = ['preview', 'staging', 'production'] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];

export type Provider = 'cloudflare' | 'store' | 'vercel';

// A workflow allowed to report for an environment. A job inside a reusable
// workflow reports that reusable file as its `job_workflow_ref` and the
// workflow the run started from as its `workflow_ref`; a shared reusable
// publisher is therefore bound to a project through its calling workflow.
export type WorkflowRule = string | { reusable: string; caller: string };

export type ProjectEntry = {
  id: string;
  provider: Provider;
  // Workflows whose jobs publish each environment. An empty list means CI
  // cannot report for that environment.
  workflows: Readonly<Record<EnvironmentName, readonly WorkflowRule[]>>;
};

// Vercel apps publish production through their per-app production workflow.
// No workflow reports previews: Cloudflare Worker previews run on pull request
// events, which the coordinator rejects.
const vercel = (
  app: string,
  extra: { staging?: WorkflowRule[]; production?: string[] } = {}
): ProjectEntry => ({
  id: app,
  provider: 'vercel',
  workflows: {
    production: [`vercel-production-${app}.yaml`, ...(extra.production ?? [])],
    staging: extra.staging ?? [],
    preview: [],
  },
});

// Native staging through the shared wave-1 publisher, called on main from the
// app's own `<app>-cloudflare.yaml`.
const wave1 = (app: string) =>
  vercel(app, {
    staging: [
      {
        reusable: 'wave1-native-publish.yaml',
        caller: `${app}-cloudflare.yaml`,
      },
    ],
  });

// Apps whose production moved from Vercel to a native Cloudflare release
// (apps/docs/build/devops/native-start-migration.mdx). That release does not
// report to the coordinator yet, so no environment lists a workflow.
const cutover = (app: string): ProjectEntry => ({
  id: app,
  provider: 'cloudflare',
  workflows: { production: [], staging: [], preview: [] },
});

// Cloudflare Workers publish production from their own workflow at the
// production ref. Their previews run on pull request events, which the
// coordinator rejects, and they have no staging publish.
const worker = (id: string, workflow: string): ProjectEntry => ({
  id,
  provider: 'cloudflare',
  workflows: { production: [workflow], staging: [], preview: [] },
});

// Staging is listed only where a workflow publishes it and the token's `sha`
// is the published commit. `wave1-web-staging.yaml` publishes a dispatched
// `source_sha` that may differ from the token's commit, so `platform` staging
// is not reportable until that workflow can state its source commit.
// Mobile store publishes, one project per store: the jobs run in parallel in
// one run, so a shared project would serialize them on one lane.
const store = (id: string): ProjectEntry => ({
  id,
  provider: 'store',
  workflows: {
    production: ['mobile-deploy-stores.yaml'],
    staging: [],
    preview: [],
  },
});

export const PROJECTS: readonly ProjectEntry[] = [
  vercel('ai'),
  wave1('apps'),
  wave1('calendar'),
  cutover('chat'),
  cutover('cms'),
  vercel('contacts'),
  cutover('drive'),
  vercel('finance'),
  cutover('forms'),
  vercel('git'),
  vercel('infrastructure'),
  vercel('inventory'),
  vercel('learn'),
  wave1('mail'),
  vercel('meet', { production: ['meet-cloudflare.yaml'] }),
  vercel('mind'),
  vercel('nova'),
  vercel('pay'),
  vercel('platform'),
  vercel('rewise'),
  vercel('shortener'),
  vercel('storefront'),
  vercel('tasks', { production: ['tasks-cloudflare.yaml'] }),
  cutover('teach'),
  cutover('tools'),
  cutover('track'),
  worker('colab', 'colab-cloudflare.yaml'),
  worker('coordination', 'coordination-cloudflare.yaml'),
  worker('cron-control', 'cron-control-cloudflare.yaml'),
  worker('devbox-control', 'devbox-control-cloudflare.yaml'),
  worker('lettin', 'lettin-cloudflare.yaml'),
  worker('meet-worker', 'meet-cloudflare.yaml'),
  worker('parley', 'parley-cloudflare.yaml'),
  // The tuturuuu.com gateway Worker, published by the Web OpenNext workflow.
  worker('gateway', 'web-opennext.yaml'),
  store('mobile-android'),
  store('mobile-ios'),
  store('mobile-macos'),
];

const byId = new Map(PROJECTS.map((project) => [project.id, project]));

export function findProject(id: string): ProjectEntry | undefined {
  return byId.get(id);
}

export function isEnvironment(value: string): value is EnvironmentName {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

// Protected ref every token for the environment must carry. Previews are
// dispatched from main with a preview_ref input.
export function requiredRef(environment: EnvironmentName) {
  return environment === 'production'
    ? 'refs/heads/production'
    : 'refs/heads/main';
}

export const workflowFiles = (rule: WorkflowRule) =>
  typeof rule === 'string' ? [rule] : [rule.reusable, rule.caller];

export function allowedWorkflows(
  project: ProjectEntry,
  environment: EnvironmentName
) {
  return project.workflows[environment];
}

export function objectName(project: string, environment: EnvironmentName) {
  return `${project}:${environment}`;
}

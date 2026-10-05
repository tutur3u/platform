const {
  resumeProductionDeployment,
} = require('./resume-production-package-deployment.js');
const sha = 'a'.repeat(40);
const env = { GITHUB_REPOSITORY: 'owner/repo' };
function fixture() {
  const trigger = {
    id: 4,
    name: 'Release @tuturuuu/ui package',
    head_sha: sha,
    head_branch: 'production',
    head_repository: { full_name: env.GITHUB_REPOSITORY },
    conclusion: 'success',
    event: 'workflow_dispatch',
    run_attempt: 1,
  };
  const f = {
    event: { workflow_run: trigger },
    live: { ...trigger, status: 'completed' },
    production: sha,
    runs: [
      {
        id: 1,
        name: 'Production Deployment Planner',
        head_repository: { full_name: env.GITHUB_REPOSITORY },
        event: 'push',
        run_attempt: 1,
        head_sha: sha,
        head_branch: 'production',
        status: 'completed',
        conclusion: 'success',
      },
    ],
    jobs: [
      {
        name: 'deploy-platform / Deploy-Production',
        conclusion: 'success',
        steps: [
          {
            name: 'Skip build while package releases publish',
            conclusion: 'success',
          },
          {
            name: 'Promote verified production deployment',
            conclusion: 'skipped',
          },
        ],
      },
    ],
    visible: true,
    versionReads: [],
    posts: [],
    intents: [],
    intentPosts: [],
    refs: 0,
  };
  f.api = async (route, options) => {
    if (route.startsWith('deployments?')) return f.intents;
    if (route === 'deployments' && options?.method === 'POST') {
      const body = JSON.parse(options.body);
      f.intentPosts.push(body);
      const intent = {
        id: 9,
        sha: body.ref,
        environment: body.environment,
        payload: body.payload,
      };
      f.intents.push(intent);
      return intent;
    }
    if (options?.method === 'POST') {
      f.posts.push(JSON.parse(options.body));
      return null;
    }
    if (route === 'actions/runs/4') return f.live;
    if (route === 'actions/runs/1') return f.runs[0];
    if (route === 'git/ref/heads/production') {
      f.refs++;
      return { object: { sha: f.production } };
    }
    if (route.startsWith('actions/workflows/vercel-production.yaml/runs?'))
      return { workflow_runs: f.runs };
    if (route.startsWith('actions/runs/1/jobs?')) return { jobs: f.jobs };
    throw Error(`Unexpected route ${route}`);
  };
  f.run = () =>
    resumeProductionDeployment({
      event: f.event,
      env,
      api: f.api,
      changedPackages: [
        { packageJson: { name: '@tuturuuu/ui' }, version: '1.0.0' },
      ],
      versionExists: (version) => {
        f.versionReads.push(version);
        return f.visible;
      },
      logger: { log() {} },
    });
  return f;
}

module.exports = { fixture, sha, env };

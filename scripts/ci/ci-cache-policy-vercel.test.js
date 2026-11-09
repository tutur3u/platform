const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  repoRoot,
  vercelWorkflows,
} = require('./workflow-config-test-helpers.js');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');
function readWorkflow(workflowName) {
  return fs.readFileSync(path.join(workflowsDir, workflowName), 'utf8');
}

const activeVercelProjects = {
  ai: '@tuturuuu/ai-studio',
  apps: '@tuturuuu/apps',
  calendar: '@tuturuuu/calendar',
  chat: '@tuturuuu/chat',
  cms: '@tuturuuu/cms',
  contacts: '@tuturuuu/contacts',
  drive: '@tuturuuu/drive',
  finance: '@tuturuuu/finance',
  forms: '@tuturuuu/forms',
  git: '@tuturuuu/git',
  infrastructure: '@tuturuuu/infrastructure',
  inventory: '@tuturuuu/inventory',
  learn: '@tuturuuu/learn',
  mail: '@tuturuuu/mail',
  meet: '@tuturuuu/meet',
  mind: '@tuturuuu/mind',
  nova: '@tuturuuu/nova',
  pay: '@tuturuuu/pay',
  platform: '@tuturuuu/web',
  rewise: '@tuturuuu/rewise',
  shortener: '@tuturuuu/shortener',
  storefront: '@tuturuuu/storefront',
  'tanstack-web': '@tuturuuu/tanstack-web',
  tasks: '@tuturuuu/tasks',
  teach: '@tuturuuu/teach',
  tools: '@tuturuuu/tools',
  track: '@tuturuuu/track',
};
const vercelInstallCommand =
  'cd ../.. && bun install --frozen-lockfile --minimum-release-age=0';

test('all 27 active Vercel projects preserve their exact Turbo build recipes', () => {
  assert.equal(Object.keys(activeVercelProjects).length, 27);
  assert.equal(vercelWorkflows.length, 54);

  for (const [project, workspace] of Object.entries(activeVercelProjects)) {
    const appDirectory = project === 'platform' ? 'web' : project;
    const config = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'apps', appDirectory, 'vercel.json'),
        'utf8'
      )
    );

    const legacyProfiles = {
      ai: { quote: '"', concurrency: ' --concurrency=2' },
      cms: { quote: '"', concurrency: ' --concurrency=2' },
      external: { quote: '"', concurrency: '' },
      finance: { quote: '"', concurrency: ' --concurrency=2' },
      git: { quote: '"', concurrency: '' },
      tools: { quote: "'", concurrency: ' --concurrency=2' },
    };
    const profile = legacyProfiles[project];
    const expectedBuild = profile
      ? `cd ../.. && bun turbo:local run build --filter=${profile.quote}${workspace}^...${profile.quote}${profile.concurrency} && bun run --cwd apps/${project} build:legacy`
      : `cd ../.. && bun turbo:local run build --filter=${workspace}`;
    assert.equal(
      config.buildCommand,
      expectedBuild,
      `${project} must preserve its exact Turbo supplier and app build recipe`
    );
    if (profile) {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(repoRoot, 'apps', project, 'package.json'),
          'utf8'
        )
      );
      assert.equal(
        manifest.scripts['build:legacy'],
        'next build --turbopack',
        `${project} legacy recipe must remain the Next build`
      );
    }
    assert.equal(
      config.installCommand,
      vercelInstallCommand,
      `${project} must preserve the dependency refresh override inside Vercel`
    );

    for (const target of ['preview', 'production']) {
      const workflowName = `vercel-${target}-${project}.yaml`;
      const workflow = readWorkflow(workflowName);

      assert.ok(vercelWorkflows.includes(workflowName));
      assert.match(
        workflow,
        /uses: \.\/\.github\/actions\/run-with-turbo-remote-cache/u
      );
      assert.match(workflow, /command: vercel build/u);
      assert.match(
        workflow,
        /PLATFORM_BUILD_ENVIRONMENT: (?:preview|production)/u
      );
      assert.match(workflow, /PLATFORM_BUILD_REF_NAME:/u);
      assert.match(workflow, /NODE_OPTIONS: --max-old-space-size=8192/u);
      assert.match(workflow, /TURBO_CONCURRENCY: "2"/u);
      assert.doesNotMatch(workflow, /Build workspace dependencies/u);
      assert.doesNotMatch(workflow, /^\s+run:\s+vercel build/mu);
    }
  }

  for (const inactiveProject of ['external', 'playground']) {
    const config = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'apps', inactiveProject, 'vercel.json'),
        'utf8'
      )
    );
    assert.equal(
      config.git.deploymentEnabled,
      false,
      `${inactiveProject} must not deploy automatically`
    );
    if (inactiveProject === 'external') {
      assert.equal(
        config.buildCommand,
        'cd ../.. && bun turbo:local run build --filter="@tuturuuu/external^..." && bun run --cwd apps/external build:legacy'
      );
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(repoRoot, 'apps/external/package.json'),
          'utf8'
        )
      );
      assert.equal(manifest.scripts['build:legacy'], 'next build --turbopack');
    } else {
      assert.equal(config.buildCommand, undefined);
    }
  }
});

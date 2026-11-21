const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { repoRoot } = require('./workflow-config-test-helpers.js');

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
  infrastructure: '@tuturuuu/admin',
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

  for (const [project, workspace] of Object.entries(activeVercelProjects)) {
    const appDirectory =
      { platform: 'web', infrastructure: 'admin' }[project] ?? project;
    const config = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'apps', appDirectory, 'vercel.json'),
        'utf8'
      )
    );

    const legacyProfiles = {
      ai: { quote: '"', concurrency: ' --concurrency=2' },
      calendar: { quote: "'", concurrency: '' },
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

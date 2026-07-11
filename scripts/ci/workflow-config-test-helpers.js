const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

const targetApps = [
  ['apps', '@tuturuuu/apps'],
  ['calendar', '@tuturuuu/calendar'],
  ['chat', '@tuturuuu/chat'],
  ['cms', '@tuturuuu/cms'],
  ['contacts', '@tuturuuu/contacts'],
  ['drive', '@tuturuuu/drive'],
  ['finance', '@tuturuuu/finance'],
  ['inventory', '@tuturuuu/inventory'],
  ['infrastructure', '@tuturuuu/infrastructure'],
  ['storefront', '@tuturuuu/storefront'],
  ['mail', '@tuturuuu/mail'],
  ['meet', '@tuturuuu/meet'],
  ['mind', '@tuturuuu/mind'],
  ['nova', '@tuturuuu/nova'],
  ['pay', '@tuturuuu/pay'],
  ['tanstack-web', '@tuturuuu/tanstack-web'],
  ['tools', '@tuturuuu/tools'],
  ['rewise', '@tuturuuu/rewise'],
  ['shortener', '@tuturuuu/shortener'],
  ['tasks', '@tuturuuu/tasks'],
  ['teach', '@tuturuuu/teach'],
  ['track', '@tuturuuu/track'],
  ['learn', '@tuturuuu/learn'],
];

const vercelWorkflows = [
  'apps',
  'calendar',
  'chat',
  'cms',
  'contacts',
  'drive',
  'finance',
  'inventory',
  'infrastructure',
  'storefront',
  'mail',
  'meet',
  'mind',
  'nova',
  'pay',
  'platform',
  'tanstack-web',
  'tools',
  'rewise',
  'shortener',
  'tasks',
  'teach',
  'track',
  'learn',
].flatMap((app) => [
  `vercel-preview-${app}.yaml`,
  `vercel-production-${app}.yaml`,
]);

function writePackageJson(rootDir, workspacePath, packageJson) {
  const packageDir = path.join(rootDir, workspacePath);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
}

function writeTextFile(rootDir, filePath, content) {
  const absolutePath = path.join(rootDir, filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function workspaceDependencies(names) {
  return Object.fromEntries(names.map((name) => [name, 'workspace:*']));
}

function createFixtureRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-config-'));

  writePackageJson(rootDir, 'apps/web', {
    dependencies: workspaceDependencies([
      '@tuturuuu/internal-api',
      '@tuturuuu/ui',
    ]),
    name: '@tuturuuu/web',
  });

  for (const [app, packageName] of targetApps) {
    const dependenciesByApp = {
      apps: [
        '@tuturuuu/icons',
        '@tuturuuu/ui',
        '@tuturuuu/utils',
        '@tuturuuu/vercel',
      ],
      calendar: ['@tuturuuu/ui'],
      chat: [
        '@tuturuuu/auth',
        '@tuturuuu/icons',
        '@tuturuuu/internal-api',
        '@tuturuuu/offline',
        '@tuturuuu/satellite',
        '@tuturuuu/supabase',
        '@tuturuuu/types',
        '@tuturuuu/ui',
        '@tuturuuu/utils',
        '@tuturuuu/vercel',
      ],
      cms: ['@tuturuuu/satellite'],
      contacts: [
        '@tuturuuu/auth',
        '@tuturuuu/icons',
        '@tuturuuu/internal-api',
        '@tuturuuu/satellite',
        '@tuturuuu/supabase',
        '@tuturuuu/types',
        '@tuturuuu/ui',
        '@tuturuuu/utils',
      ],
      drive: [
        '@tuturuuu/auth',
        '@tuturuuu/icons',
        '@tuturuuu/internal-api',
        '@tuturuuu/offline',
        '@tuturuuu/satellite',
        '@tuturuuu/supabase',
        '@tuturuuu/types',
        '@tuturuuu/ui',
        '@tuturuuu/utils',
        '@tuturuuu/vercel',
      ],
      finance: ['@tuturuuu/satellite'],
      inventory: ['@tuturuuu/satellite'],
      infrastructure: [
        '@tuturuuu/ai',
        '@tuturuuu/auth',
        '@tuturuuu/email-service',
        '@tuturuuu/icons',
        '@tuturuuu/internal-api',
        '@tuturuuu/payment',
        '@tuturuuu/realtime',
        '@tuturuuu/satellite',
        '@tuturuuu/supabase',
        '@tuturuuu/transactional',
        '@tuturuuu/turnstile',
        '@tuturuuu/types',
        '@tuturuuu/ui',
        '@tuturuuu/utils',
        '@tuturuuu/vercel',
      ],
      storefront: ['@tuturuuu/satellite'],
      learn: ['@tuturuuu/ui'],
      mail: [
        '@tuturuuu/auth',
        '@tuturuuu/icons',
        '@tuturuuu/internal-api',
        '@tuturuuu/offline',
        '@tuturuuu/satellite',
        '@tuturuuu/supabase',
        '@tuturuuu/types',
        '@tuturuuu/ui',
        '@tuturuuu/utils',
        '@tuturuuu/vercel',
      ],
      meet: ['@tuturuuu/satellite'],
      mind: ['@tuturuuu/internal-api', '@tuturuuu/satellite'],
      nova: ['@tuturuuu/types'],
      pay: [
        '@tuturuuu/auth',
        '@tuturuuu/icons',
        '@tuturuuu/internal-api',
        '@tuturuuu/inventory-core',
        '@tuturuuu/payment',
        '@tuturuuu/payment-core',
        '@tuturuuu/satellite',
        '@tuturuuu/supabase',
        '@tuturuuu/types',
        '@tuturuuu/ui',
        '@tuturuuu/utils',
      ],
      'tanstack-web': [
        '@tuturuuu/icons',
        '@tuturuuu/internal-api',
        '@tuturuuu/offline',
        '@tuturuuu/payment',
        '@tuturuuu/supabase',
        '@tuturuuu/transactional',
        '@tuturuuu/types',
        '@tuturuuu/ui',
        '@tuturuuu/utils',
      ],
      tools: ['@tuturuuu/ui', '@tuturuuu/utils', '@tuturuuu/vercel'],
      rewise: ['@tuturuuu/satellite'],
      shortener: ['@tuturuuu/vercel'],
      tasks: ['@tuturuuu/internal-api'],
      teach: ['@tuturuuu/ui'],
      track: ['@tuturuuu/satellite'],
    };

    writePackageJson(rootDir, `apps/${app}`, {
      dependencies: workspaceDependencies(dependenciesByApp[app]),
      name: packageName,
    });
  }

  const packageDefinitions = {
    ai: [
      '@tuturuuu/google',
      '@tuturuuu/internal-api',
      '@tuturuuu/supabase',
      '@tuturuuu/utils',
    ],
    apis: [],
    auth: [
      '@tuturuuu/supabase',
      '@tuturuuu/types',
      '@tuturuuu/ui',
      '@tuturuuu/utils',
    ],
    'email-service': [
      '@tuturuuu/supabase',
      '@tuturuuu/types',
      '@tuturuuu/utils',
    ],
    google: [],
    hooks: [],
    icons: [],
    'inventory-core': [],
    'internal-api': ['@tuturuuu/types'],
    offline: [],
    payment: [],
    'payment-core': [],
    realtime: [],
    satellite: ['@tuturuuu/auth', '@tuturuuu/ui'],
    supabase: ['@tuturuuu/types'],
    transactional: [],
    turnstile: [],
    types: [],
    ui: [
      '@tuturuuu/ai',
      '@tuturuuu/apis',
      '@tuturuuu/hooks',
      '@tuturuuu/icons',
      '@tuturuuu/internal-api',
      '@tuturuuu/supabase',
      '@tuturuuu/utils',
    ],
    unused: [],
    utils: [
      '@tuturuuu/google',
      '@tuturuuu/icons',
      '@tuturuuu/internal-api',
      '@tuturuuu/supabase',
    ],
    vercel: [],
  };

  for (const [packageDir, dependencies] of Object.entries(packageDefinitions)) {
    writePackageJson(rootDir, `packages/${packageDir}`, {
      dependencies: workspaceDependencies(dependencies),
      name: `@tuturuuu/${packageDir}`,
    });
  }

  return rootDir;
}

function git(rootDir, args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
}

function initializeGitRepo(rootDir) {
  git(rootDir, ['init', '-b', 'main']);
  git(rootDir, ['config', 'user.email', 'ci@example.com']);
  git(rootDir, ['config', 'user.name', 'CI Test']);
  git(rootDir, ['add', '.']);
  git(rootDir, ['commit', '-m', 'initial']);

  return git(rootDir, ['rev-parse', 'HEAD']);
}

function commitFile(rootDir, filePath, content, message) {
  writeTextFile(rootDir, filePath, content);
  git(rootDir, ['add', filePath]);
  git(rootDir, ['commit', '-m', message]);

  return git(rootDir, ['rev-parse', 'HEAD']);
}

function writeEventPayload(rootDir, payload) {
  const eventPath = path.join(rootDir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify(payload, null, 2));

  return eventPath;
}

function runChangedFileResolver({
  env = {},
  eventName = 'push',
  eventPath,
  headSha,
  refName = 'main',
  rootDir,
  workflowName = 'vercel-preview-calendar.yaml',
}) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changed-files-'));
  const output = execFileSync(
    'bun',
    [
      'run',
      '--silent',
      'scripts/ci/resolve-changed-files.ts',
      '--workflow',
      workflowName,
      '--event-name',
      eventName,
      '--event-path',
      eventPath,
      '--head-sha',
      headSha,
      '--ref-name',
      refName,
      '--root-dir',
      rootDir,
      '--output-dir',
      outputDir,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REPOSITORY: '',
        GITHUB_TOKEN: '',
        ...env,
      },
    }
  );
  const pathMatch = output.match(/^Changed files path: (.+)$/m);
  const changedFilesPath =
    pathMatch && pathMatch[1] !== '(unavailable)' ? pathMatch[1] : null;

  return {
    changedFiles: changedFilesPath
      ? fs.readFileSync(changedFilesPath, 'utf8').split(/\r?\n/).filter(Boolean)
      : null,
    output,
  };
}

function readWorkflowJobBlock(workflowName, jobName) {
  const source = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', workflowName),
    'utf8'
  );
  const lines = source.split('\n');
  const start = lines.indexOf(`  ${jobName}:`);

  assert.notEqual(start, -1, `Expected ${workflowName} to define ${jobName}`);

  const nextJob = lines.findIndex(
    (line, index) => index > start && /^ {2}[A-Za-z0-9_-]+:$/.test(line)
  );
  const end = nextJob === -1 ? lines.length : nextJob;

  return lines.slice(start, end).join('\n');
}

function runWorkflowDecision({
  changedFiles,
  eventName = 'push',
  rootDir,
  workflowName,
}) {
  const output = execFileSync(
    'bun',
    [
      'run',
      '--silent',
      'scripts/ci/check-workflow-config.ts',
      '--workflow',
      workflowName,
      '--event-name',
      eventName,
      '--root-dir',
      rootDir,
      '--changed-files',
      changedFiles.join('\n'),
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );

  return {
    output,
    shouldRun: /Should run: true/.test(output),
  };
}

function assertWorkflowDecision(options, expectedShouldRun) {
  const decision = runWorkflowDecision(options);

  assert.equal(
    decision.shouldRun,
    expectedShouldRun,
    `${options.workflowName} output:\n${decision.output}`
  );

  return decision;
}

module.exports = {
  assertWorkflowDecision,
  commitFile,
  createFixtureRoot,
  git,
  initializeGitRepo,
  readWorkflowJobBlock,
  repoRoot,
  runChangedFileResolver,
  vercelWorkflows,
  writeEventPayload,
};

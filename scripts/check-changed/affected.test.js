const test = require('node:test');
const assert = require('node:assert/strict');

const {
  turboDryArgs,
  workspacesFromDry,
  selectAffectedWorkspaces,
} = require('./affected.js');

const sha = 'a'.repeat(40);
const workspaces = [
  { workspace: 'packages/types', name: '@tuturuuu/types' },
  { workspace: 'packages/utils', name: '@tuturuuu/utils' },
  { workspace: 'apps/web', name: '@tuturuuu/web' },
  { workspace: 'packages/upstream', name: '@tuturuuu/upstream' },
];

function dry(packages, tasks) {
  return { packages, tasks };
}

test('dry selection stays dry, build-free, and local without both cache credentials', () => {
  const args = turboDryArgs(sha, {});
  assert.ok(args.includes('--dry=json'));
  assert.equal(args.includes('build'), false);
  assert.ok(args.includes('--cache=local:rw'));
  assert.ok(args.includes('--concurrency=2'));
  assert.ok(args.includes(`--filter=...[${sha}]`));
  assert.deepEqual(args.slice(0, 4), [
    'run',
    'type-check',
    'test',
    '--dry=json',
  ]);
});

test('remote cache is left to Turbo only when token and team are already non-empty', () => {
  const present = turboDryArgs(sha, {
    TURBO_TOKEN: 'present',
    TURBO_TEAM: 'present',
  });
  assert.equal(present.includes('--cache=local:rw'), false);
  assert.ok(present.includes('--dry=json'));
  for (const env of [
    { TURBO_TOKEN: 'present' },
    { TURBO_TEAM: 'present' },
    { TURBO_TOKEN: '  ', TURBO_TEAM: 'present' },
    { TURBO_TOKEN: 'present', TURBO_TEAM: '' },
  ]) {
    assert.ok(turboDryArgs(sha, env).includes('--cache=local:rw'));
  }
});

test('dry graph keeps scoped type-check and test packages and drops build prerequisites', () => {
  const selected = workspacesFromDry(
    dry(
      [
        '@tuturuuu/types',
        '@tuturuuu/utils',
        '@tuturuuu/web',
        '@tuturuuu/upstream',
      ],
      [
        {
          task: 'build',
          package: '@tuturuuu/upstream',
          directory: 'packages/upstream',
          resolvedTaskDefinition: { dependsOn: ['^build'] },
        },
        {
          task: 'type-check',
          package: '@tuturuuu/types',
          directory: 'packages/types',
          resolvedTaskDefinition: { dependsOn: ['^build', '^type-check'] },
        },
        {
          task: 'type-check',
          package: '@tuturuuu/utils',
          directory: 'packages/utils',
        },
        {
          task: 'test',
          package: '@tuturuuu/web',
          directory: 'apps/web',
          dependencies: [
            '@tuturuuu/utils#type-check',
            '@tuturuuu/upstream#build',
          ],
        },
      ]
    ),
    workspaces
  );
  assert.deepEqual(selected, ['apps/web', 'packages/types', 'packages/utils']);
});

test('packages outside the filter scope are not selected from prerequisite tasks', () => {
  const selected = workspacesFromDry(
    dry(
      ['@tuturuuu/web'],
      [
        {
          task: 'type-check',
          package: '@tuturuuu/upstream',
          directory: 'packages/upstream',
        },
        {
          task: 'type-check',
          package: '@tuturuuu/web',
          directory: 'apps/web',
          dependencies: [
            '@tuturuuu/upstream#type-check',
            '@tuturuuu/upstream#build',
          ],
        },
      ]
    ),
    workspaces
  );
  assert.deepEqual(selected, ['apps/web']);
});

test('a dry graph without a package scope fails closed', () => {
  assert.equal(workspacesFromDry({ tasks: [] }, workspaces), null);
});

test('a failed dry command does not execute and reports cache presence without values', () => {
  const calls = [];
  const failed = selectAffectedWorkspaces({
    root: '/tmp/missing-turbo-root',
    mergeBase: sha,
    env: { TURBO_TOKEN: 'present', TURBO_TEAM: 'present', PATH: '/usr/bin' },
    workspaces,
    spawn: (command, args, options) => {
      calls.push({ command, args, concurrency: options.env.TURBO_CONCURRENCY });
      return { status: 1, stdout: '', stderr: 'nope' };
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.remote, 'set');
  assert.equal(calls[0].args.includes('--dry=json'), true);
  assert.equal(calls[0].args.includes('--cache=local:rw'), false);
  assert.equal(calls[0].concurrency, '2');
  assert.equal(JSON.stringify(failed).includes('present'), false);

  const local = selectAffectedWorkspaces({
    root: '/tmp/missing-turbo-root',
    mergeBase: 'not a sha',
    env: {},
    workspaces,
    spawn: () => {
      throw new Error('must not spawn');
    },
  });
  assert.equal(local.ok, false);
  assert.equal(local.remote, 'unset');
});

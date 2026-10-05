const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

function runMarkerLookup({
  deployments,
  markerKind = 'build',
  sha,
  statuses,
  workflowName,
}) {
  return execFileSync(
    'node',
    [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      `
        const deployments = JSON.parse(process.env.TEST_DEPLOYMENTS);
        const statuses = JSON.parse(process.env.TEST_STATUSES);
        globalThis.fetch = async (url) => {
          const parsedUrl = new URL(String(url));
          const response = (body, ok = true, status = 200) => ({
            ok,
            status,
            statusText: ok ? 'OK' : 'Not Found',
            json: async () => body,
          });

          if (parsedUrl.pathname === '/repos/tutur3u/platform/deployments') {
            return response(deployments);
          }

          const statusMatch = parsedUrl.pathname.match(/^\\/statuses\\/(.+)$/);

          if (statusMatch) {
            return response(statuses[statusMatch[1]] ?? []);
          }

          return response({ message: 'not found' }, false, 404);
        };

        const { hasSuccessfulDeploymentMarker } = await import('./scripts/ci/github-deployment-markers.ts');
        const found = await hasSuccessfulDeploymentMarker({
          markerKind: process.env.TEST_MARKER_KIND,
          sha: process.env.TEST_SHA,
          workflowName: process.env.TEST_WORKFLOW_NAME,
        });

        console.log(String(found));
      `,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_API_URL: 'https://api.example.test',
        GITHUB_REPOSITORY: 'tutur3u/platform',
        GITHUB_TOKEN: 'test-token',
        TEST_DEPLOYMENTS: JSON.stringify(deployments),
        TEST_MARKER_KIND: markerKind,
        TEST_SHA: sha,
        TEST_STATUSES: JSON.stringify(statuses),
        TEST_WORKFLOW_NAME: workflowName,
      },
    }
  ).trim();
}

function runLastSuccessfulShaLookup({
  requireExplicitDeployment = false,
  deployments,
  refName,
  statuses,
  workflowName,
}) {
  return execFileSync(
    'node',
    [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      `
        const deployments = JSON.parse(process.env.TEST_DEPLOYMENTS);
        const statuses = JSON.parse(process.env.TEST_STATUSES);
        globalThis.fetch = async (url) => {
          const parsedUrl = new URL(String(url));
          const response = (body, ok = true, status = 200) => ({
            ok,
            status,
            statusText: ok ? 'OK' : 'Not Found',
            json: async () => body,
          });

          if (parsedUrl.pathname === '/repos/tutur3u/platform/deployments') {
            return response(deployments);
          }

          const statusMatch = parsedUrl.pathname.match(/^\\/statuses\\/(.+)$/);

          if (statusMatch) {
            return response(statuses[statusMatch[1]] ?? []);
          }

          return response({ message: 'not found' }, false, 404);
        };

        const { findLastSuccessfulDeploymentSha } = await import('./scripts/ci/github-deployment-markers.ts');
        const sha = await findLastSuccessfulDeploymentSha({
          requireExplicitDeployment: process.env.TEST_EXPLICIT === 'true',
          refName: process.env.TEST_REF_NAME,
          workflowName: process.env.TEST_WORKFLOW_NAME,
        });

        console.log(sha ?? '');
      `,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_API_URL: 'https://api.example.test',
        GITHUB_REPOSITORY: 'tutur3u/platform',
        GITHUB_TOKEN: 'test-token',
        TEST_DEPLOYMENTS: JSON.stringify(deployments),
        TEST_REF_NAME: refName,
        TEST_EXPLICIT: String(requireExplicitDeployment),
        TEST_STATUSES: JSON.stringify(statuses),
        TEST_WORKFLOW_NAME: workflowName,
      },
    }
  ).trim();
}

test('successful deployment marker lookup matches build markers by workflow and SHA', () => {
  const sha = '1234567890abcdef1234567890abcdef12345678';
  const found = runMarkerLookup({
    deployments: [
      {
        id: 1,
        payload: {
          markerKind: 'build',
          sha,
          workflowName: 'vercel-production-platform.yaml',
        },
        sha,
        statuses_url: 'https://api.example.test/statuses/1',
      },
    ],
    sha,
    statuses: {
      1: [{ state: 'success' }],
    },
    workflowName: 'vercel-production-platform.yaml',
  });

  assert.equal(found, 'true');
});

test('successful marker lookup accepts inactive latest status after success', () => {
  const sha = '1234567890abcdef1234567890abcdef12345678';
  const found = runMarkerLookup({
    deployments: [
      {
        id: 1,
        payload: {
          markerKind: 'build',
          sha,
          workflowName: 'vercel-production-platform.yaml',
        },
        sha,
        statuses_url: 'https://api.example.test/statuses/1',
      },
    ],
    sha,
    statuses: {
      1: [{ state: 'inactive' }, { state: 'success' }],
    },
    workflowName: 'vercel-production-platform.yaml',
  });

  assert.equal(found, 'true');
});

test('platform build lookup accepts legacy platform markers without markerKind', () => {
  const sha = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const found = runMarkerLookup({
    deployments: [
      {
        id: 1,
        payload: {
          sha,
          workflowName: 'vercel-preview-platform.yaml',
        },
        sha,
        statuses_url: 'https://api.example.test/statuses/1',
      },
    ],
    sha,
    statuses: {
      1: [{ state: 'success' }],
    },
    workflowName: 'vercel-preview-platform.yaml',
  });

  assert.equal(found, 'true');
});

test('non-platform build lookup rejects legacy deployment markers', () => {
  const sha = 'fedcbafedcbafedcbafedcbafedcbafedcbafedc';
  const found = runMarkerLookup({
    deployments: [
      {
        id: 1,
        payload: {
          sha,
          workflowName: 'vercel-production-calendar.yaml',
        },
        sha,
        statuses_url: 'https://api.example.test/statuses/1',
      },
    ],
    sha,
    statuses: {
      1: [{ state: 'success' }],
    },
    workflowName: 'vercel-production-calendar.yaml',
  });

  assert.equal(found, 'false');
});

test('last successful marker lookup accepts inactive latest status after success', () => {
  const sha = '1234567890abcdef1234567890abcdef12345678';
  const found = runLastSuccessfulShaLookup({
    deployments: [
      {
        id: 1,
        payload: {
          refName: 'production',
          sha,
          workflowName: 'vercel-production-platform.yaml',
        },
        sha,
        statuses_url: 'https://api.example.test/statuses/1',
      },
    ],
    refName: 'production',
    statuses: {
      1: [{ state: 'inactive' }, { state: 'success' }],
    },
    workflowName: 'vercel-production-platform.yaml',
  });

  assert.equal(found, sha);
});

test('Learn build marker cannot advance a deployed baseline', () => {
  const found = runLastSuccessfulShaLookup({
    deployments: [
      {
        sha: 'built',
        payload: { markerKind: 'build', refName: 'main' },
        statuses_url: 'https://api.example.test/statuses/build',
      },
      {
        sha: 'deployed',
        payload: { markerKind: 'deployment', refName: 'main' },
        statuses_url: 'https://api.example.test/statuses/deploy',
      },
    ],
    refName: 'main',
    workflowName: 'vercel-preview-learn.yaml',
    statuses: { build: [{ state: 'success' }], deploy: [{ state: 'success' }] },
  });
  assert.equal(found, 'deployed');
});

for (const workflowName of [
  'vercel-preview-platform.yaml',
  'vercel-production-platform.yaml',
]) {
  test(`${workflowName} retains existing build baseline behavior`, () => {
    assert.equal(
      runLastSuccessfulShaLookup({
        deployments: [
          {
            sha: 'built',
            payload: { markerKind: 'build', refName: 'main' },
            statuses_url: 'https://api.example.test/statuses/build',
          },
        ],
        refName: 'main',
        workflowName,
        statuses: { build: [{ state: 'success' }] },
      }),
      'built'
    );
  });
}

test('Learn build-only history has no deployed baseline', () => {
  assert.equal(
    runLastSuccessfulShaLookup({
      deployments: [
        {
          sha: 'built',
          payload: { markerKind: 'build', refName: 'main' },
          statuses_url: 'https://api.example.test/statuses/build',
        },
      ],
      refName: 'main',
      workflowName: 'vercel-preview-learn.yaml',
      statuses: { build: [{ state: 'success' }] },
    }),
    ''
  );
});

test('explicit recovery marker loses exact-SHA coverage when success is followed by failure', () => {
  const sha = '1234567890abcdef1234567890abcdef12345678';
  const workflowName = 'vercel-production-platform.yaml';
  const input = {
    requireExplicitDeployment: true,
    refName: 'production',
    workflowName,
    deployments: [
      {
        id: 1,
        sha,
        payload: {
          workflowName,
          markerKind: 'deployment',
          refName: 'production',
        },
        statuses_url: 'https://api.example.test/statuses/1',
      },
    ],
  };
  assert.equal(
    runLastSuccessfulShaLookup({
      ...input,
      statuses: { 1: [{ state: 'success' }] },
    }),
    sha
  );
  for (const state of ['failure', 'error', 'pending', 'inactive'])
    assert.equal(
      runLastSuccessfulShaLookup({
        ...input,
        statuses: { 1: [{ state }, { state: 'success' }] },
      }),
      ''
    );
});

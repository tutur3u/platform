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

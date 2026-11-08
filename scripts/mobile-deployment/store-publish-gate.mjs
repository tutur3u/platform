#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

// apps/mobile holds the app source, CHANGELOG, and committed release history.
// Workflow and script edits stay outside this tree, so they can trigger a dry
// run without allocating a new store build number.
export const MOBILE_STORE_TREE_PATH = 'apps/mobile';
export const UPLOADED_TREE_ARTIFACT = 'mobile-store-uploaded-tree';
export const UPLOADED_TREE_FILE = 'mobile-store-uploaded-tree.txt';
export const UPLOAD_JOB_NAMES = [
  'Publish Android to Google Play internal',
  'Upload iOS to TestFlight',
];

const workflowRunsPath =
  '/repos/REPO/actions/workflows/mobile-deploy-stores.yaml/runs?per_page=30';

export function decideStorePublish({ currentTree, recordedTree, force }) {
  if (!/^[a-f0-9]{40}$/u.test(currentTree ?? '')) {
    throw new Error('current mobile tree hash is missing');
  }
  if (force === true) return { publish: true, reason: 'force' };
  if (recordedTree == null) {
    return { publish: true, reason: 'no-recorded-upload' };
  }
  if (!/^[a-f0-9]{40}$/u.test(recordedTree)) {
    throw new Error('recorded mobile tree hash is malformed');
  }
  if (currentTree === recordedTree) {
    return { publish: false, reason: 'unchanged' };
  }
  return { publish: true, reason: 'tree-changed' };
}

export function parseUploadedTree(text) {
  const match = /^tree ([a-f0-9]{40})$/u.exec(String(text).trim());
  if (!match) throw new Error('uploaded tree artifact is malformed');
  return match[1];
}

export function readZipText(buffer, filename) {
  const zip = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let offset = 0;
  while (offset + 30 <= zip.length) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) break;
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (name === filename || name.endsWith(`/${filename}`)) {
      if (method === 0) return data.toString('utf8');
      if (method === 8) return inflateRawSync(data).toString('utf8');
      throw new Error(`unsupported zip method ${method}`);
    }
    offset = dataStart + compressedSize;
  }
  throw new Error(`zip entry ${filename} is missing`);
}

export function treeAt(sha, git = execFileSync) {
  const hash = git('git', ['rev-parse', `${sha}:${MOBILE_STORE_TREE_PATH}`], {
    encoding: 'utf8',
  }).trim();
  if (!/^[a-f0-9]{40}$/u.test(hash)) {
    throw new Error('mobile tree hash is malformed');
  }
  return hash;
}

function uploaded(jobs) {
  return (jobs ?? []).some(
    (job) => UPLOAD_JOB_NAMES.includes(job.name) && job.conclusion === 'success'
  );
}

export async function loadRecordedTree({ repo, token, readTree, request }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo)) {
    throw new Error('repository is malformed');
  }
  const listed = await request(workflowRunsPath.replace('REPO', repo), token);
  const runs = listed.workflow_runs ?? [];
  for (const run of runs) {
    const artifacts = await request(
      `/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`,
      token
    );
    const match = (artifacts.artifacts ?? []).find(
      (item) => item.name === UPLOADED_TREE_ARTIFACT && item.expired !== true
    );
    if (!match) continue;
    const zip = await request(
      `/repos/${repo}/actions/artifacts/${match.id}/zip`,
      token,
      { zip: true }
    );
    return parseUploadedTree(readZipText(zip, UPLOADED_TREE_FILE));
  }
  for (const run of runs) {
    const jobs = await request(
      `/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`,
      token
    );
    if (!uploaded(jobs.jobs)) continue;
    try {
      return readTree(run.head_sha);
    } catch {
      // That upload commit is no longer reachable. Try the next one.
    }
  }
  return null;
}

export function gateOutput({ publish, tree }) {
  return `publish=${publish ? 'true' : 'false'}\ntree=${tree}\n`;
}

async function githubRequest(path, token, { zip = false } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: zip ? 'follow' : 'error',
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status})`);
  }
  if (zip) return Buffer.from(await response.arrayBuffer());
  return response.json();
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!repo) throw new Error('GITHUB_REPOSITORY is required');
  const sha =
    process.env.HEAD_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const currentTree = treeAt(sha);
  const recordedTree = await loadRecordedTree({
    repo,
    token,
    readTree: treeAt,
    request: githubRequest,
  });
  const decision = decideStorePublish({
    currentTree,
    recordedTree,
    force: process.env.FORCE_STORE_PUBLISH === 'true',
  });
  const body = gateOutput({ publish: decision.publish, tree: currentTree });
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, body);
  console.log(
    `mobile store publish: ${decision.publish ? 'upload' : 'skip'} (${decision.reason})`
  );
}

if (process.argv[1]?.endsWith('/store-publish-gate.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

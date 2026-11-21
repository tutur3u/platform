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

function zipChecksum(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function readZipText(buffer, filename) {
  const zip = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const malformed = () => {
    throw new Error('malformed or unsupported zip archive');
  };
  const fits = (offset, size, limit = zip.length) =>
    offset >= 0 && size >= 0 && offset <= limit && size <= limit - offset;
  // The central directory carries sizes when streamed local headers contain zeroes.
  let end = -1;
  for (
    let i = zip.length - 22;
    i >= Math.max(0, zip.length - 22 - 65535);
    i--
  ) {
    if (
      zip.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + zip.readUInt16LE(i + 20) === zip.length
    ) {
      end = i;
      break;
    }
  }
  const entries = [];
  let dataLimit = zip.length;
  if (end !== -1) {
    const count = zip.readUInt16LE(end + 10);
    const size = zip.readUInt32LE(end + 12);
    const start = zip.readUInt32LE(end + 16);
    if (
      zip.readUInt16LE(end + 4) ||
      zip.readUInt16LE(end + 6) ||
      zip.readUInt16LE(end + 8) !== count ||
      count === 0xffff ||
      size === 0xffffffff ||
      start === 0xffffffff ||
      !fits(start, size, end) ||
      start + size !== end
    )
      malformed();
    dataLimit = start;
    let cursor = start;
    for (let i = 0; i < count; i++) {
      if (!fits(cursor, 46, end) || zip.readUInt32LE(cursor) !== 0x02014b50)
        malformed();
      const nameLength = zip.readUInt16LE(cursor + 28);
      const length =
        46 +
        nameLength +
        zip.readUInt16LE(cursor + 30) +
        zip.readUInt16LE(cursor + 32);
      if (!fits(cursor, length, end) || zip.readUInt16LE(cursor + 34))
        malformed();
      entries.push({
        offset: zip.readUInt32LE(cursor + 42),
        flags: zip.readUInt16LE(cursor + 8),
        method: zip.readUInt16LE(cursor + 10),
        crc: zip.readUInt32LE(cursor + 16),
        compressed: zip.readUInt32LE(cursor + 20),
        size: zip.readUInt32LE(cursor + 24),
        name: zip.subarray(cursor + 46, cursor + 46 + nameLength).toString(),
      });
      cursor += length;
    }
    if (cursor !== end) malformed();
  }
  let offset = 0;
  let index = 0;
  let text;
  while (end !== -1 ? index < entries.length : fits(offset, 30)) {
    const entry = end !== -1 ? entries[index++] : null;
    if (entry) offset = entry.offset;
    if (
      !fits(offset, 30, dataLimit) ||
      zip.readUInt32LE(offset) !== 0x04034b50
    ) {
      if (entry) malformed();
      break;
    }
    const flags = zip.readUInt16LE(offset + 6);
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = entry
      ? entry.compressed
      : zip.readUInt32LE(offset + 18);
    const size = entry ? entry.size : zip.readUInt32LE(offset + 22);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLength + extraLength;
    if (
      !fits(offset + 30, nameLength + extraLength, dataLimit) ||
      !fits(dataStart, compressedSize, dataLimit) ||
      compressedSize === 0xffffffff ||
      size === 0xffffffff ||
      flags & 0x2041
    )
      malformed();
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    if (
      entry &&
      (entry.name !== name || entry.flags !== flags || entry.method !== method)
    )
      malformed();
    if (flags & 8) {
      if (!entry) malformed();
      let descriptor = dataStart + compressedSize;
      if (!fits(descriptor, 12, dataLimit)) malformed();
      if (zip.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
      if (
        !fits(descriptor, 12, dataLimit) ||
        zip.readUInt32LE(descriptor) !== entry.crc ||
        zip.readUInt32LE(descriptor + 4) !== compressedSize ||
        zip.readUInt32LE(descriptor + 8) !== size
      )
        malformed();
    } else if (
      entry &&
      (zip.readUInt32LE(offset + 18) !== compressedSize ||
        zip.readUInt32LE(offset + 22) !== size ||
        zip.readUInt32LE(offset + 14) !== entry.crc)
    )
      malformed();
    if (name === filename || name.endsWith(`/${filename}`)) {
      const data = zip.subarray(dataStart, dataStart + compressedSize);
      let raw;
      if (method === 0) raw = data;
      else if (method === 8) {
        const inflated = inflateRawSync(data, {
          info: true,
          maxOutputLength: Math.max(1, size),
        });
        if (inflated.engine.bytesWritten !== compressedSize) malformed();
        raw = inflated.buffer;
      } else throw new Error(`unsupported zip method ${method}`);
      if (raw.length !== size || (entry && zipChecksum(raw) !== entry.crc))
        malformed();
      if (entry) return raw.toString('utf8');
      text ??= raw.toString('utf8');
    }
    offset = dataStart + compressedSize;
  }
  if (end === -1 && offset !== zip.length) malformed();
  if (text !== undefined) return text;
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

export const MAC_UPLOAD_JOB_NAME = 'Upload macOS to the Mac App Store';
// A Mac job can conclude `success` with its upload skipped (older runs did so
// when signing entries were missing), so its acceptance step must succeed.
export const MAC_ACCEPTED_STEP_NAME =
  'Verify App Store Connect accepted the macOS build';

function requiredJobs(macEnabled) {
  return macEnabled
    ? [...UPLOAD_JOB_NAMES, MAC_UPLOAD_JOB_NAME]
    : UPLOAD_JOB_NAMES;
}

function delivered(job) {
  if (job?.conclusion !== 'success') return false;
  if (job.name !== MAC_UPLOAD_JOB_NAME) return true;
  return (job.steps ?? []).some(
    (step) =>
      step.name === MAC_ACCEPTED_STEP_NAME && step.conclusion === 'success'
  );
}

/** True when the run reached any store job (it was not skipped or pending). */
function attempted(jobs, macEnabled) {
  return requiredJobs(macEnabled).some((name) =>
    (jobs ?? []).some(
      (job) =>
        job.name === name &&
        ['success', 'failure', 'cancelled', 'timed_out'].includes(
          job.conclusion
        )
    )
  );
}

function uploaded(jobs, macEnabled) {
  return requiredJobs(macEnabled).every((name) =>
    (jobs ?? []).some((job) => job.name === name && delivered(job))
  );
}

/**
 * The baseline is the tree of the newest run that attempted the stores, and
 * only if every enabled store verifiably accepted it. A newer partial attempt
 * (one store took tree B, another failed) leaves the stores on different
 * trees, so it yields no baseline and the next run publishes, even when
 * production reverted to an older, fully delivered tree. Artifacts written by
 * older runs are trusted only after the run's own jobs prove delivery.
 */
export async function loadRecordedTree({
  repo,
  token,
  readTree,
  request,
  macEnabled = false,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo)) {
    throw new Error('repository is malformed');
  }
  const listed = await request(workflowRunsPath.replace('REPO', repo), token);
  for (const run of listed.workflow_runs ?? []) {
    // Every attempt (a rerun's latest view can hide an earlier partial
    // delivery), across every page: reruns can push store jobs past page 1.
    const jobs = [];
    for (let page = 1; ; page++) {
      if (page > 50) throw new Error('workflow run has too many jobs to read');
      const listed = (
        await request(
          `/repos/${repo}/actions/runs/${run.id}/jobs?filter=all&per_page=100&page=${page}`,
          token
        )
      ).jobs;
      if (!Array.isArray(listed))
        throw new Error('workflow jobs are unreadable');
      jobs.push(...listed);
      if (listed.length < 100) break;
    }
    if (!attempted(jobs, macEnabled)) continue;
    if (!uploaded(jobs, macEnabled)) return null;
    const artifacts = await request(
      `/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`,
      token
    );
    const match = (artifacts.artifacts ?? []).find(
      (item) => item.name === UPLOADED_TREE_ARTIFACT && item.expired !== true
    );
    if (match) {
      const zip = await request(
        `/repos/${repo}/actions/artifacts/${match.id}/zip`,
        token,
        { zip: true }
      );
      return parseUploadedTree(readZipText(zip, UPLOADED_TREE_FILE));
    }
    try {
      return readTree(run.head_sha);
    } catch {
      // That upload commit is no longer reachable: no trustworthy baseline.
      return null;
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
    macEnabled: process.env.MAC_APP_STORE_ENABLED === 'true',
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

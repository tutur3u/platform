import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertEmittedMapping } from './asset-mapping.mjs';

const MAX_FILES = 10000;
const MAX_BYTES = 100 * 1024 * 1024;
const identityKeys = ['dev', 'ino', 'mode'];
const snapshotKeys = [...identityKeys, 'nlink', 'size', 'mtimeNs', 'ctimeNs'];

function flags() {
  if (typeof fs.constants.O_NOFOLLOW !== 'number') {
    throw new Error('No-follow artifact access is unavailable');
  }
  return (
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
}

export function openArtifactEntry(path) {
  return fs.openSync(path, flags());
}

function assertStat(actual, expected, keys = snapshotKeys) {
  if (keys.some((key) => actual[key] !== expected[key])) {
    throw new Error('Artifact identity or content changed while sealing');
  }
}

export function readRegularFile(fd, remainingBytes = MAX_BYTES) {
  const before = fs.fstatSync(fd, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n) {
    throw new Error('Require a single-link regular artifact file');
  }
  if (before.size > BigInt(remainingBytes)) {
    throw new Error('Artifact size bound exceeded');
  }
  const data = Buffer.alloc(Number(before.size));
  let offset = 0;
  while (offset < data.length) {
    const count = fs.readSync(fd, data, offset, data.length - offset, offset);
    if (count === 0) throw new Error('Artifact truncated while sealing');
    offset += count;
  }
  if (fs.readSync(fd, Buffer.alloc(1), 0, 1, offset) !== 0) {
    throw new Error('Artifact grew while sealing');
  }
  assertStat(fs.fstatSync(fd, { bigint: true }), before);
  return {
    data,
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

function descriptorPath(fd, name = '') {
  return join('/proc/self/fd', String(fd), name);
}

function assertEntry(parent, name, expected) {
  const fd = openArtifactEntry(descriptorPath(parent, name));
  try {
    assertStat(fs.fstatSync(fd, { bigint: true }), expected, identityKeys);
  } finally {
    fs.closeSync(fd);
  }
}

function openRoot(root) {
  if (!isAbsolute(root)) throw new Error('Artifact root must be absolute');
  const chain = [];
  try {
    for (const name of [sep, ...resolve(root).split(sep).filter(Boolean)]) {
      const parent = chain.at(-1)?.fd;
      const fd = openArtifactEntry(
        parent === undefined ? name : descriptorPath(parent, name)
      );
      const entry = { fd, parent, name };
      chain.push(entry);
      entry.stat = fs.fstatSync(fd, { bigint: true });
      if (!entry.stat.isDirectory())
        throw new Error('Artifact ancestor is not a directory');
    }
    return chain;
  } catch (error) {
    for (const entry of chain.reverse()) fs.closeSync(entry.fd);
    throw error;
  }
}

export function sealArtifact(root, source) {
  if (!/^[a-f0-9]{40}$/.test(source ?? ''))
    throw new Error('Supply the exact build source SHA');
  if (process.platform !== 'linux') {
    throw new Error(
      'Descriptor-anchored sealing requires the qualified Linux /proc filesystem'
    );
  }
  const ancestors = openRoot(root);
  const appFd = ancestors.at(-1).fd;
  const contents = new Map();
  const files = [];
  let totalBytes = 0;
  function walk(fd, prefix) {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isDirectory())
      throw new Error('Artifact directory is not regular');
    for (const name of fs.readdirSync(descriptorPath(fd)).sort()) {
      const child = openArtifactEntry(descriptorPath(fd, name));
      try {
        const stat = fs.fstatSync(child, { bigint: true });
        const path = `${prefix}/${name}`;
        if (stat.isDirectory()) {
          walk(child, path);
        } else {
          if (files.length >= MAX_FILES)
            throw new Error('Artifact file bound exceeded');
          const file = readRegularFile(child, MAX_BYTES - totalBytes);
          totalBytes += file.bytes;
          contents.set(path, file.data);
          files.push({ path, bytes: file.bytes, sha256: file.sha256 });
        }
        assertEntry(fd, name, stat);
      } finally {
        fs.closeSync(child);
      }
    }
    assertStat(fs.fstatSync(fd, { bigint: true }), before);
  }
  try {
    const dist = openArtifactEntry(descriptorPath(appFd, 'dist'));
    try {
      const distStat = fs.fstatSync(dist, { bigint: true });
      walk(dist, 'dist');
      assertEntry(appFd, 'dist', distStat);
    } finally {
      fs.closeSync(dist);
    }
    const configs = files.filter((file) =>
      /(?:^|\/)wrangler\.json$/.test(file.path)
    );
    if (configs.length !== 1)
      throw new Error('Require one actual emitted JSON Worker configuration');
    const config = JSON.parse(contents.get(configs[0].path).toString('utf8'));
    assertEmittedMapping(
      config,
      configs[0].path,
      files.map((file) => file.path),
      root
    );
    if (
      !files.some(
        (file) =>
          /\.[cm]?js$/.test(file.path) &&
          contents.get(file.path).includes(source)
      )
    )
      throw new Error('Source identity missing from emitted code');
    for (const entry of ancestors) {
      if (entry.parent !== undefined)
        assertEntry(entry.parent, entry.name, entry.stat);
    }
    const manifest = {
      source,
      worker: config.name,
      basePath: '/roadmap',
      providerAssetBase: '/',
      assetDirectory: 'dist/client',
      emittedConfig: configs[0].path,
      files,
    };
    const output = fs.openSync(
      descriptorPath(appFd, 'roadmap-artifact.json'),
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600
    );
    try {
      fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
      fs.fsyncSync(output);
    } finally {
      fs.closeSync(output);
    }
    return manifest;
  } finally {
    for (const entry of ancestors.reverse()) fs.closeSync(entry.fd);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const source = process.argv[2];
  const manifest = sealArtifact(
    fileURLToPath(new URL('../', import.meta.url)),
    source
  );
  console.log(
    `Sealed ${manifest.files.length} emitted files for ${source}; this does not attest runtime or deployment`
  );
}

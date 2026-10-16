import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  createReadStream,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  openSync,
  renameSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { privateParent, safePath } from '../cli/operational-files';
import { digest, fail, parseJson } from '../cli/operational-schema';
import { artifactSchema, artifactUrl, type ModelArtifact } from './artifact';
import {
  acquirePrivateLock,
  readPrivateFile,
  syncDirectory,
  writePrivateJson,
} from './cache';

const transferSchema = z
  .object({
    artifactHash: z.string(),
    attempts: z.number().int().min(0).max(3),
    transportBytes: z.number().int().nonnegative(),
    checkpointBytes: z.number().int().nonnegative(),
    prefixHash: z.string().regex(/^[0-9a-f]{64}$/),
    partId: z.uuid(),
    partInode: z.number().int().nonnegative(),
    partDevice: z.number().int().nonnegative(),
    state: z.enum(['partial', 'verified', 'failed']),
  })
  .strict();
type Transfer = z.infer<typeof transferSchema>;

export async function verifyArtifact(path: string, input: ModelArtifact) {
  const artifact = artifactSchema.parse(input);
  const fd = openSync(
    safePath(path),
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      (stat.mode & 0o077) !== 0 ||
      stat.size !== artifact.bytes
    )
      fail('ARTIFACT_INVALID', 'artifact size or private permissions differ');
    const hash = createHash('sha256');
    for await (const bytes of createReadStream('', {
      fd,
      autoClose: false,
      highWaterMark: 64 * 1024,
    }))
      hash.update(bytes);
    if (hash.digest('hex') !== artifact.sha256)
      fail('ARTIFACT_INVALID', 'artifact checksum mismatch');
    const magic = Buffer.alloc(8);
    const { readSync } = await import('node:fs');
    readSync(fd, magic, 0, 8, 0);
    if (
      artifact.format === 'gguf' &&
      magic.subarray(0, 4).toString('ascii') !== 'GGUF'
    )
      fail('ARTIFACT_INVALID', 'artifact is not GGUF');
    if (
      artifact.format === 'litertlm' &&
      magic.toString('ascii') !== 'LITERTLM'
    )
      fail('ARTIFACT_INVALID', 'artifact is not LiteRT-LM');
    return { verified: true, bytes: artifact.bytes, sha256: artifact.sha256 };
  } finally {
    closeSync(fd);
  }
}

async function publicResponse(
  url: string,
  offset: number,
  fetcher: typeof fetch,
  signal: AbortSignal
) {
  let next = url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const parsed = new URL(next);
    if (
      parsed.protocol !== 'https:' ||
      parsed.port !== '' ||
      parsed.username ||
      parsed.password ||
      ![
        'huggingface.co',
        'us.aws.cdn.hf.co',
        'cas-bridge.xethub.hf.co',
        'cdn-lfs.huggingface.co',
        'cdn-lfs-us-1.huggingface.co',
      ].includes(parsed.hostname)
    )
      fail(
        'DOWNLOAD_AUTHORITY',
        'redirect is outside approved public artifact hosts'
      );
    const response = await fetcher(next, {
      redirect: 'manual',
      credentials: 'omit',
      headers: offset ? { Range: `bytes=${offset}-` } : {},
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location) fail('DOWNLOAD_RESPONSE', 'redirect lacks location');
    next = new URL(location, next).toString();
  }
  return fail('DOWNLOAD_RESPONSE', 'too many artifact redirects');
}

export async function downloadArtifact({
  path: input,
  artifact: raw,
  fetcher = fetch,
  signal,
}: {
  path: string;
  artifact: ModelArtifact;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}) {
  const artifact = artifactSchema.parse(raw);
  const path = safePath(input);
  privateParent(path);
  const release = acquirePrivateLock(`${path}.transfer-lock.sqlite`);
  let part = safePath(`${path}.partial`);
  const statePath = `${path}.transfer.json`;
  let fd: number | undefined;
  let transfer: Transfer | undefined;
  const persist = () =>
    writePrivateJson(statePath, transfer, () => {
      const previous = transferSchema.parse(
        parseJson(readPrivateFile(statePath, 4096).toString())
      );
      if (previous.artifactHash !== digest(artifact))
        fail(
          'DOWNLOAD_CONFLICT',
          'transfer metadata belongs to another artifact'
        );
    });
  try {
    try {
      return await verifyArtifact(path, artifact);
    } catch (error) {
      if (
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      )
        throw error;
    }
    const artifactHash = digest(artifact);
    try {
      transfer = transferSchema.parse(
        parseJson(readPrivateFile(statePath, 4096).toString())
      );
    } catch (error) {
      if (
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      )
        throw error;
      try {
        const foreign = openSync(
          part,
          constants.O_RDONLY | constants.O_NOFOLLOW
        );
        closeSync(foreign);
        fail(
          'DOWNLOAD_OWNERSHIP',
          'refusing an existing partial file without its verified transfer manifest'
        );
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          )
        )
          throw error;
      }
      const partId = randomUUID();
      part = safePath(`${path}.partial-${partId}`);
      fd = openSync(
        part,
        constants.O_RDWR |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600
      );
      const initial = fstatSync(fd);
      fsyncSync(fd);
      syncDirectory(part);
      transfer = {
        artifactHash,
        attempts: 0,
        transportBytes: 0,
        checkpointBytes: 0,
        prefixHash: createHash('sha256').digest('hex'),
        partId,
        partInode: initial.ino,
        partDevice: initial.dev,
        state: 'partial',
      };
      persist();
    }
    part = safePath(`${path}.partial-${transfer.partId}`);
    if (transfer.artifactHash !== artifactHash)
      fail('DOWNLOAD_CONFLICT', 'partial transfer belongs to another artifact');
    if (transfer.state === 'failed' || transfer.attempts >= 3)
      fail('DOWNLOAD_STOPPED', 'transfer retry budget is exhausted');
    transfer.attempts++;
    persist();
    if (fd === undefined)
      fd = openSync(part, constants.O_RDWR | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > artifact.bytes
    )
      fail('UNSAFE_CACHE', 'partial artifact is not a bounded private file');
    if (transfer.partInode !== stat.ino || transfer.partDevice !== stat.dev)
      fail(
        'DOWNLOAD_OWNERSHIP',
        'partial file identity differs from its transfer manifest'
      );
    if (
      transfer.checkpointBytes > stat.size ||
      transfer.checkpointBytes > artifact.bytes
    )
      fail(
        'ARTIFACT_INVALID',
        'partial checkpoint size differs from retained file'
      );
    let prefix = createHash('sha256');
    if (transfer.checkpointBytes)
      for await (const chunk of createReadStream('', {
        fd,
        autoClose: false,
        start: 0,
        end: transfer.checkpointBytes - 1,
        highWaterMark: 65536,
      }))
        prefix.update(chunk);
    if (prefix.copy().digest('hex') !== transfer.prefixHash)
      fail('ARTIFACT_INVALID', 'partial checkpoint hash mismatch');
    let offset = transfer.checkpointBytes;
    if (stat.size !== offset) {
      ftruncateSync(fd, offset);
      fsyncSync(fd);
    }
    if (offset < artifact.bytes) {
      const timeout = AbortSignal.timeout(120000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const response = await publicResponse(
        artifactUrl(artifact),
        offset,
        fetcher,
        combined
      );
      if (response.status === 200 && offset) {
        transfer.checkpointBytes = 0;
        prefix = createHash('sha256');
        transfer.prefixHash = prefix.copy().digest('hex');
        persist();
        ftruncateSync(fd, 0);
        offset = 0;
      }
      if (![200, 206].includes(response.status) || !response.body)
        fail('DOWNLOAD_RESPONSE', 'artifact request failed');
      if (
        response.status === 206 &&
        response.headers.get('content-range') !==
          `bytes ${offset}-${artifact.bytes - 1}/${artifact.bytes}`
      ) {
        await response.body.cancel();
        fail('DOWNLOAD_RESPONSE', 'artifact range does not match checkpoint');
      }
      const declared = response.headers.get('content-length');
      if (declared !== null && Number(declared) !== artifact.bytes - offset) {
        await response.body.cancel();
        fail('DOWNLOAD_RESPONSE', 'artifact length does not match manifest');
      }
      const reader = response.body.getReader();
      try {
        for (;;) {
          if (combined.aborted) throw combined.reason;
          const chunk = await reader.read();
          if (chunk.done) break;
          transfer.transportBytes += chunk.value.length;
          if (
            offset + chunk.value.length > artifact.bytes ||
            transfer.transportBytes > artifact.bytes * 2
          ) {
            transfer.state = 'failed';
            fail('DOWNLOAD_CAPACITY', 'artifact transfer exceeded byte budget');
          }
          persist();
          let written = 0;
          while (written < chunk.value.length)
            written += writeSync(
              fd,
              chunk.value,
              written,
              chunk.value.length - written,
              offset + written
            );
          offset += written;
          fsyncSync(fd);
          prefix.update(chunk.value);
          transfer.checkpointBytes = offset;
          transfer.prefixHash = prefix.copy().digest('hex');
          persist();
        }
      } finally {
        await reader.cancel();
      }
    }
    if (offset !== artifact.bytes)
      fail(
        'DOWNLOAD_INCOMPLETE',
        'partial transfer retained; explicit retry resumes it'
      );
    closeSync(fd);
    fd = undefined;
    const result = await verifyArtifact(part, artifact);
    renameSync(part, path);
    const directory = openSync(dirname(path), constants.O_RDONLY);
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
    transfer.state = 'verified';
    persist();
    return result;
  } catch (error) {
    if (transfer) {
      if (
        transfer.attempts >= 3 ||
        (error instanceof Error &&
          'code' in error &&
          [
            'ARTIFACT_INVALID',
            'DOWNLOAD_CAPACITY',
            'DOWNLOAD_OWNERSHIP',
            'EEXIST',
          ].includes(String(error.code)))
      )
        transfer.state = 'failed';
      persist();
    }
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
    release();
  }
}

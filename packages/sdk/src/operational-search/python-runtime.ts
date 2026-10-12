import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  createReadStream,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statfsSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { privateParent, safePath } from '../cli/operational-files';
import { digest, fail, parseJson } from '../cli/operational-schema';
import { LITERT_RECIPE, TEXT_LITERT } from './artifact';
import { bytesHash } from './cache';
import { verifyArtifact } from './download';
import {
  PYTHON_INSTALLATION_MANIFEST as installationManifest,
  PYTHON_ADAPTER_CODE,
  PYTHON_ADAPTER_HASH,
  PYTHON_RUNTIME_MANIFEST as runtimeManifest,
} from './python-adapter-code';
import { type EmbeddingRuntime, normalizeVector } from './runtime';

export const MAX_PRIVATE_RUNTIME_BYTES = 512 * 1024 ** 2;
export function inspectRuntimeDirectory(input: string) {
  const root = safePath(input);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0)
    fail(
      'UNSAFE_CACHE',
      'runtime root must be an existing private 0700 directory'
    );
  let bytes = 0;
  let count = 0;
  function walk(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (++count > 10000)
        fail('RUNTIME_CAPACITY', 'runtime directory exceeds file-count bound');
      const child = join(path, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(child);
      else bytes += lstatSync(child).size;
      if (bytes > MAX_PRIVATE_RUNTIME_BYTES)
        fail('RUNTIME_CAPACITY', 'private runtime cache exceeds 512 MiB');
    }
  }
  walk(root);
  const filesystem = statfsSync(root);
  return { root, bytes, headroomBytes: filesystem.bavail * filesystem.bsize };
}

const probeSchema = z
  .object({
    runtimeVersion: z.literal('0.18.0'),
    python: z.literal('3.12.15'),
    platform: z.literal('arm64'),
    nativeEmbeddingSymbol: z.literal(true),
    nativeLibraryHash: z.string().regex(/^[0-9a-f]{64}$/),
    modelLoaded: z.literal(false),
    packages: z.record(z.string(), z.string()),
  })
  .passthrough();

function assertDeadline(deadline: number) {
  if (Date.now() >= deadline)
    fail('RUNTIME_CAPACITY', 'absolute runtime command deadline exhausted');
}

async function fileHash(input: string, deadline: number) {
  assertDeadline(deadline);
  const fd = openSync(
    safePath(input),
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o022) !== 0)
      fail(
        'RUNTIME_INVALID',
        'runtime file must be regular without public write access'
      );
    const hash = createHash('sha256');
    for await (const block of createReadStream('', {
      fd,
      autoClose: false,
      highWaterMark: 65536,
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    })) {
      assertDeadline(deadline);
      hash.update(block);
    }
    return hash.digest('hex');
  } finally {
    closeSync(fd);
  }
}

export async function authenticatePythonInstallation(
  root: string,
  deadline = Date.now() + 30000
) {
  assertDeadline(deadline);
  const venv = join(safePath(root), 'venv');
  const interpreter = realpathSync(join(safePath(join(venv, 'bin')), 'python'));
  if (
    interpreter !== installationManifest.interpreter.path ||
    (await fileHash(interpreter, deadline)) !==
      installationManifest.interpreter.sha256
  )
    fail(
      'RUNTIME_INVALID',
      'interpreter differs from the approved installation'
    );
  const configuration = Object.fromEntries(
    readFileSync(safePath(join(venv, 'pyvenv.cfg')), 'utf8')
      .split('\n')
      .filter((line) => line.includes(' = '))
      .map((line) => line.split(' = ', 2))
  );
  for (const [key, value] of Object.entries(installationManifest.configuration))
    if (configuration[key] !== value)
      fail(
        'RUNTIME_INVALID',
        'venv configuration differs from the approved installation'
      );
  const expected = new Map(
    installationManifest.files.map((file) => [file.path, file.sha256])
  );
  const actual: string[] = [];
  function walk(path: string, relative: string) {
    assertDeadline(deadline);
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink())
        fail('RUNTIME_INVALID', 'installed code contains a symlink');
      const child = join(path, entry.name);
      const childRelative = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child, childRelative);
      else {
        actual.push(childRelative);
        if (actual.length > 2000)
          fail('RUNTIME_INVALID', 'installed code file count exceeds bound');
      }
    }
  }
  walk(
    join(venv, 'lib/python3.12/site-packages'),
    'lib/python3.12/site-packages'
  );
  if (actual.length !== expected.size)
    fail(
      'RUNTIME_INVALID',
      'installed code differs from the trusted file manifest'
    );
  for (const path of actual)
    if (
      !expected.has(path) ||
      (await fileHash(join(venv, path), deadline)) !== expected.get(path)
    )
      fail(
        'RUNTIME_INVALID',
        'installed code checksum differs from trusted manifest'
      );
}

async function runPython(
  root: string,
  probe: boolean,
  text?: string,
  deadline = Date.now() + 30000
) {
  const capacity = inspectRuntimeDirectory(root);
  if (capacity.headroomBytes < 4 * 1024 ** 3)
    fail('RUNTIME_CAPACITY', 'local runtime requires 4 GiB fresh headroom');
  await authenticatePythonInstallation(root, deadline);
  assertDeadline(deadline);
  if (process.platform !== 'darwin' || process.arch !== 'arm64')
    fail(
      'RUNTIME_UNSUPPORTED',
      'only the verified darwin arm64 runtime is admitted'
    );
  if (bytesHash(Buffer.from(PYTHON_ADAPTER_CODE)) !== PYTHON_ADAPTER_HASH)
    fail('RUNTIME_INVALID', 'embedded adapter hash mismatch');
  const args = ['-I', '-B', '-c', PYTHON_ADAPTER_CODE];
  const scratch = join(root, 'engine-cache');
  if (probe) args.push('--probe');
  else {
    privateParent(join(scratch, 'placeholder'));
    args.push(
      '--model',
      join(root, 'models', TEXT_LITERT.filename),
      '--cache',
      scratch
    );
  }
  return new Promise<unknown>((resolve, reject) => {
    assertDeadline(deadline);
    const child = spawn(join(root, 'venv', 'bin', 'python'), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', HF_HUB_OFFLINE: '1' },
    });
    let output = '';
    let diagnosticBytes = 0;
    let failure: Error | undefined;
    const stop = (message: string) => {
      failure = new Error(message);
      child.kill('SIGKILL');
    };
    const timeout = setTimeout(
      () => stop('runtime wall-clock budget exceeded'),
      Math.max(1, Math.min(30000, deadline - Date.now()))
    );
    const memory = setInterval(() => {
      try {
        const current = inspectRuntimeDirectory(root);
        if (current.headroomBytes < 4 * 1024 ** 3)
          stop('runtime disk headroom fell below 4 GiB');
      } catch {
        stop('runtime storage envelope exceeded');
      }
      if (!child.pid) return;
      const result = spawnSync(
        '/bin/ps',
        ['-o', 'rss=', '-p', String(child.pid)],
        {
          encoding: 'utf8',
          timeout: 1000,
          maxBuffer: 4096,
          env: { PATH: '/usr/bin:/bin' },
        }
      );
      if (result.status === 0 && Number(result.stdout.trim()) > 768 * 1024)
        stop('runtime RSS exceeded 768 MiB sampled bound');
    }, 500);
    const clear = () => {
      clearTimeout(timeout);
      clearInterval(memory);
    };
    child.stdout.on('data', (bytes: Buffer) => {
      output += bytes.toString();
      if (Buffer.byteLength(output) > 128 * 1024)
        stop('runtime output exceeded bound');
    });
    child.stderr.on('data', (bytes: Buffer) => {
      diagnosticBytes += bytes.length;
      if (diagnosticBytes > 128 * 1024)
        stop('runtime diagnostics exceeded bound');
    });
    child.stdin.on('error', () => {});
    child.stdin.end(probe ? '' : JSON.stringify({ text }));
    child.on('error', (error) => {
      clear();
      reject(error);
    });
    child.on('close', (code) => {
      clear();
      try {
        const current = inspectRuntimeDirectory(root);
        if (current.headroomBytes < 4 * 1024 ** 3)
          failure = new Error('runtime disk headroom fell below 4 GiB');
      } catch {
        failure = new Error('runtime storage envelope exceeded');
      }
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error('isolated local runtime failed'));
      else {
        try {
          resolve(parseJson(output));
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}

export async function probePythonRuntime(
  input: string,
  deadline = Date.now() + 30000
) {
  const { root } = inspectRuntimeDirectory(input);
  const proof = probeSchema.parse(
    await runPython(root, true, undefined, deadline)
  );
  for (const wheel of runtimeManifest.wheels) {
    if (proof.packages[wheel.name] !== wheel.version)
      fail(
        'RUNTIME_INVALID',
        'installed package versions differ from pinned wheel manifest'
      );
  }
  return {
    ...proof,
    adapterHash: PYTHON_ADAPTER_HASH,
    wheelManifestHash: digest(runtimeManifest),
    root,
  };
}

export async function createPythonRuntime(
  input: string
): Promise<EmbeddingRuntime> {
  const deadline = Date.now() + 60000;
  const proof = await probePythonRuntime(input, deadline);
  await verifyArtifact(
    join(proof.root, 'models', TEXT_LITERT.filename),
    TEXT_LITERT
  );
  const fingerprint = digest({
    artifact: TEXT_LITERT,
    recipe: LITERT_RECIPE,
    runtimeVersion: proof.runtimeVersion,
    nativeLibraryHash: proof.nativeLibraryHash,
    adapterHash: proof.adapterHash,
    wheelManifestHash: proof.wheelManifestHash,
  });
  assertDeadline(deadline);
  let calls = 0;
  return {
    fingerprint,
    async embed(text, kind, title = 'none') {
      if (++calls > 8 || Date.now() >= deadline)
        fail('EMBEDDING_CAPACITY', 'finite runtime command budget exhausted');
      const prompt =
        kind === 'query'
          ? `${LITERT_RECIPE.queryPrefix}${text.trim()}`
          : `${LITERT_RECIPE.documentPrefix}${title.trim()} | ${text.trim()}`;
      if (Buffer.byteLength(prompt) > 8192)
        fail('EMBEDDING_CAPACITY', 'embedding prompt exceeds 8 KiB');
      const result = z
        .object({
          embedding: z.array(z.number().finite()).length(768),
          runtimeVersion: z.literal('0.18.0'),
          recipe: z.literal('litert-docs-0.18-text-v1'),
        })
        .strict()
        .parse(await runPython(proof.root, false, prompt, deadline));
      return normalizeVector(result.embedding);
    },
  };
}

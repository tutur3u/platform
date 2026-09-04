import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const APPROVED_TYPEGEN_OUTPUT = 'packages/types/src/supabase.ts';
const MAX_TYPEGEN_OUTPUT_BYTES = 64 * 1024 * 1024;

export function validateTypegenOutputPath(repositoryRoot, requestedPath) {
  if (!requestedPath) return null;
  if (requestedPath !== APPROVED_TYPEGEN_OUTPUT) {
    throw new Error(
      `Type generation output must be exactly ${APPROVED_TYPEGEN_OUTPUT}.`
    );
  }

  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const resolvedTarget = path.resolve(resolvedRepositoryRoot, requestedPath);
  const expectedTarget = path.join(
    resolvedRepositoryRoot,
    ...APPROVED_TYPEGEN_OUTPUT.split('/')
  );
  if (resolvedTarget !== expectedTarget) {
    throw new Error('Type generation output escaped the repository root.');
  }

  let current = resolvedRepositoryRoot;
  for (const segment of ['packages', 'types', 'src']) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(
        `Type generation parent is not a real directory: ${current}`
      );
    }
  }

  if (fs.existsSync(resolvedTarget)) {
    const stat = fs.lstatSync(resolvedTarget);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error('Type generation output must be a regular file.');
    }
  }

  return requestedPath;
}

export function runBufferedCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    let outputBytes = 0;
    let outputExceeded = false;

    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_TYPEGEN_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill('SIGTERM');
        return;
      }
      chunks.push(chunk);
    });
    // Drain diagnostics without retaining or logging potentially sensitive data.
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({
        code: outputExceeded ? 1 : (code ?? 1),
        signal: signal ?? null,
        stdout: outputExceeded ? Buffer.alloc(0) : Buffer.concat(chunks),
      });
    });
  });
}

export async function writeTypegenOutputAtomically(
  repositoryRoot,
  outputPath,
  contents,
  { move = rename, remove = rm, write = writeFile } = {}
) {
  validateTypegenOutputPath(repositoryRoot, outputPath);
  if (contents.length === 0 || contents.toString('utf8').trim().length === 0) {
    throw new Error('Supabase type generation returned empty output.');
  }

  const target = path.resolve(repositoryRoot, outputPath);
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    await write(temporary, contents, { flag: 'wx' });
    validateTypegenOutputPath(repositoryRoot, outputPath);
    await move(temporary, target);
  } finally {
    await remove(temporary, { force: true });
  }
}

export async function generateTypesFromDisposableStack({
  binaryPath,
  metadata,
  runner = runBufferedCommand,
  writer = writeTypegenOutputAtomically,
}) {
  const result = await runner(
    binaryPath,
    [
      '--workdir',
      metadata.disposableRoot,
      'gen',
      'types',
      'typescript',
      '--local',
      '--schema',
      'public,private,storage',
    ],
    metadata.disposableRoot
  );
  if (result.code !== 0) {
    const error = new Error(
      `type generation failed with exit code ${result.code}.`
    );
    error.exitCode = result.code;
    throw error;
  }

  const contents = Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout ?? '');
  await writer(metadata.repositoryRoot, metadata.typegenOutput, contents);
}

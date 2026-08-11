#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureSupabaseBinary,
  runCommand,
  workspaceDir,
} from './run-supabase.js';
import {
  generateTypesFromDisposableStack,
  validateTypegenOutputPath,
} from './run-supabase-isolated-typegen.js';

const __filename = fileURLToPath(import.meta.url);
const DISPOSABLE_PREFIX = 'tuturuuu-supabase-';
const METADATA_FILE = '.tuturuuu-isolated-supabase.json';
const PORT_BLOCK_SIZE = 8;
const PORT_SLOT_COUNT = 2500;
const PORT_SLOT_ATTEMPTS = 8;
const PORT_START = 12000;

function runIsolatedCommand(command, args, cwd) {
  return runCommand(command, args, cwd, { stdio: 'ignore' });
}

export const PORT_FIELDS = [
  { key: 'shadow_port', offset: 0, section: 'db' },
  { key: 'port', offset: 1, section: 'api' },
  { key: 'port', offset: 2, section: 'db' },
  { key: 'port', offset: 3, section: 'studio' },
  { key: 'port', offset: 4, section: 'inbucket' },
  { key: 'port', offset: 5, section: 'analytics' },
  { key: 'port', offset: 6, section: 'db.pooler' },
  { key: 'inspector_port', offset: 7, section: 'edge_runtime' },
];

const expectedPortKeys = new Set(
  PORT_FIELDS.map(({ key, section }) => `${section}.${key}`)
);

function stableHash(value, length = 12) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function dockerSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16);
}

export function deriveIsolatedIdentity({ headSha, repositoryPath }) {
  const resolvedPath = path.resolve(repositoryPath);
  const slug = dockerSlug(path.basename(resolvedPath)) || 'worktree';
  const shortHead = headSha
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '')
    .slice(0, 8);
  const suffix = stableHash(`${resolvedPath}\0${headSha}`, 10);
  const projectId = `tt-${slug}-${shortHead || 'nohead'}-${suffix}`;

  return {
    fingerprint: stableHash(`${resolvedPath}\0${headSha}`, 32),
    headSha,
    projectId,
    repositoryPath: resolvedPath,
  };
}

export function derivePortBlock(identity, attempt = 0) {
  if (
    !Number.isInteger(attempt) ||
    attempt < 0 ||
    attempt >= PORT_SLOT_ATTEMPTS
  ) {
    throw new Error(
      `Port slot attempt must be between 0 and ${PORT_SLOT_ATTEMPTS - 1}.`
    );
  }

  const seed = Number.parseInt(stableHash(identity.fingerprint, 8), 16);
  const slot = (seed + attempt * 7919) % PORT_SLOT_COUNT;
  const basePort = PORT_START + slot * PORT_BLOCK_SIZE;

  return {
    attempt,
    basePort,
    ports: Object.fromEntries(
      PORT_FIELDS.map(({ key, offset, section }) => [
        `${section}.${key}`,
        basePort + offset,
      ])
    ),
  };
}

export function rewriteSupabaseConfig(source, { basePort, projectId }) {
  const counts = new Map();
  const activePortKeys = new Set();
  let currentSection = '';
  let projectCount = 0;

  const output = source.split('\n').map((line) => {
    const sectionMatch = line.match(/^\s*\[([^\]]+)]\s*(?:#.*)?$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      return line;
    }

    if (/^\s*#/.test(line)) {
      return line;
    }

    const assignment = line.match(
      /^(\s*)([a-z_]+)(\s*=\s*)([^#]*?)(\s*(?:#.*)?)$/i
    );
    if (!assignment) {
      return line;
    }

    const [, indentation, key, separator, rawValue, suffix] = assignment;
    if (!currentSection && key === 'project_id') {
      projectCount += 1;
      return `${indentation}${key}${separator}"${projectId}"${suffix}`;
    }

    if (
      (key === 'port' || key.endsWith('_port')) &&
      /^\d+$/.test(rawValue.trim())
    ) {
      const qualifiedKey = `${currentSection}.${key}`;
      activePortKeys.add(qualifiedKey);
      const field = PORT_FIELDS.find(
        (candidate) =>
          candidate.section === currentSection && candidate.key === key
      );

      if (field) {
        counts.set(qualifiedKey, (counts.get(qualifiedKey) ?? 0) + 1);
        return `${indentation}${key}${separator}${basePort + field.offset}${suffix}`;
      }
    }

    return line;
  });

  if (projectCount !== 1) {
    throw new Error(`Expected exactly one project_id, found ${projectCount}.`);
  }

  const unexpectedPorts = [...activePortKeys].filter(
    (key) => !expectedPortKeys.has(key)
  );
  const invalidExpected = [...expectedPortKeys].filter(
    (key) => counts.get(key) !== 1
  );
  if (unexpectedPorts.length > 0 || invalidExpected.length > 0) {
    throw new Error(
      `Supabase port schema changed. Missing/duplicate: ${invalidExpected.join(', ') || 'none'}; unexpected: ${unexpectedPorts.join(', ') || 'none'}.`
    );
  }

  return `${output.join('\n')}`;
}

export function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host, port }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function chooseAvailablePortBlock(
  identity,
  { available = isPortAvailable, attempts = PORT_SLOT_ATTEMPTS } = {}
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const block = derivePortBlock(identity, attempt);
    const checks = await Promise.all(
      Object.values(block.ports).map((port) => available(port))
    );
    if (checks.every(Boolean)) {
      return block;
    }
  }

  throw new Error(
    `No collision-free isolated Supabase port block was found after ${attempts} attempts.`
  );
}

export function hasProjectCollision(projectId, containerNames) {
  return containerNames.some(
    (name) => name.startsWith('supabase_') && name.endsWith(`_${projectId}`)
  );
}

export function listDockerContainerNames() {
  return execFileSync('docker', ['ps', '-a', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  })
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
}

export function listTrackedSupabaseFiles(repositoryRoot) {
  return execFileSync(
    'git',
    ['ls-files', '-z', '--', 'apps/database/supabase'],
    { cwd: repositoryRoot, encoding: 'utf8' }
  )
    .split('\0')
    .filter(Boolean);
}

export function assertDisposableRoot(
  disposableRoot,
  { temporaryRoot = os.tmpdir() } = {}
) {
  const resolvedRoot = path.resolve(disposableRoot);
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  if (
    path.dirname(resolvedRoot) !== resolvedTemporaryRoot ||
    !path.basename(resolvedRoot).startsWith(DISPOSABLE_PREFIX)
  ) {
    throw new Error(`Refusing to clean unowned path: ${resolvedRoot}`);
  }

  if (
    fs.existsSync(resolvedRoot) &&
    fs.lstatSync(resolvedRoot).isSymbolicLink()
  ) {
    throw new Error(
      `Refusing to use symlinked disposable root: ${resolvedRoot}`
    );
  }

  return resolvedRoot;
}

export function validateFocusedTestPath(repositoryRoot, testPath) {
  if (!testPath) {
    return null;
  }

  const normalized = testPath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    !normalized.startsWith('supabase/tests/') ||
    !/\.(?:sql|pg)$/.test(normalized)
  ) {
    throw new Error(
      'Focused tests must be repo-relative files under supabase/tests with a .sql or .pg extension.'
    );
  }

  const databaseRoot = path.join(repositoryRoot, 'apps', 'database');
  const resolved = path.resolve(databaseRoot, normalized);
  const testsRoot = path.resolve(databaseRoot, 'supabase', 'tests');
  if (
    !resolved.startsWith(`${testsRoot}${path.sep}`) ||
    !fs.statSync(resolved).isFile()
  ) {
    throw new Error(
      `Focused test does not exist inside supabase/tests: ${testPath}`
    );
  }

  return normalized;
}

async function writeMetadata(disposableRoot, metadata) {
  await writeFile(
    path.join(disposableRoot, METADATA_FILE),
    `${JSON.stringify(metadata, null, 2)}\n`
  );
}

export async function readLifecycleMetadata(disposableRoot, options) {
  const ownedRoot = assertDisposableRoot(disposableRoot, options);
  const metadata = JSON.parse(
    await readFile(path.join(ownedRoot, METADATA_FILE), 'utf8')
  );
  if (
    metadata.version !== 1 ||
    typeof metadata.projectId !== 'string' ||
    metadata.disposableRoot !== ownedRoot
  ) {
    throw new Error(`Invalid isolated Supabase metadata in ${ownedRoot}.`);
  }
  return metadata;
}

export async function stageDisposableProject({
  basePort,
  headSha,
  projectId,
  repositoryRoot,
  temporaryRoot = os.tmpdir(),
  testPath = null,
  typegenOutput = null,
  trackedFiles = listTrackedSupabaseFiles(repositoryRoot),
}) {
  const disposableRoot = await mkdtemp(
    path.join(path.resolve(temporaryRoot), DISPOSABLE_PREFIX)
  );
  const ownedRoot = assertDisposableRoot(disposableRoot, { temporaryRoot });

  try {
    for (const trackedFile of trackedFiles) {
      const prefix = 'apps/database/';
      if (!trackedFile.startsWith(`${prefix}supabase/`)) {
        throw new Error(`Unexpected staged Supabase path: ${trackedFile}`);
      }
      const source = path.join(repositoryRoot, trackedFile);
      const destination = path.join(
        ownedRoot,
        trackedFile.slice(prefix.length)
      );
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }

    const configPath = path.join(ownedRoot, 'supabase', 'config.toml');
    const config = await readFile(configPath, 'utf8');
    await writeFile(
      configPath,
      rewriteSupabaseConfig(config, { basePort, projectId })
    );

    const metadata = {
      basePort,
      createdAt: new Date().toISOString(),
      disposableRoot: ownedRoot,
      headSha,
      projectId,
      repositoryRoot: path.resolve(repositoryRoot),
      status: 'staged',
      testPath,
      typegenOutput,
      version: 1,
    };
    await writeMetadata(ownedRoot, metadata);
    return metadata;
  } catch (error) {
    await rm(ownedRoot, { force: true, recursive: true });
    throw error;
  }
}

export async function removeDisposableRoot(disposableRoot, options) {
  const ownedRoot = assertDisposableRoot(disposableRoot, options);
  await rm(ownedRoot, { force: true, recursive: true });
}

export function installSignalHandlers(onSignal) {
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => onSignal(signal);
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler);
    }
  };
}

function signalExitCode(signal) {
  return signal === 'SIGTERM' ? 143 : 130;
}

export async function runIsolatedLifecycle({
  binaryPath,
  metadata,
  registerSignals = installSignalHandlers,
  removeRoot = removeDisposableRoot,
  runner = runIsolatedCommand,
  stderr = process.stderr,
  typegen = generateTypesFromDisposableStack,
  updateMetadata = writeMetadata,
}) {
  let originalCode = 0;
  let requestedSignal = null;
  let startAttempted = false;
  let cleanupSucceeded = true;
  const removeSignalHandlers = registerSignals((signal) => {
    requestedSignal ??= signal;
  });
  const run = async (label, args) => {
    await updateMetadata(metadata.disposableRoot, {
      ...metadata,
      status: label,
    });
    const result = await runner(binaryPath, args, metadata.disposableRoot);
    if (result.code !== 0) {
      originalCode = result.code;
      throw new Error(`${label} failed with exit code ${result.code}.`);
    }
    if (requestedSignal) {
      originalCode = signalExitCode(requestedSignal);
      throw new Error(`Interrupted by ${requestedSignal}.`);
    }
  };

  try {
    startAttempted = true;
    await run('starting', ['--workdir', metadata.disposableRoot, 'start']);
    await run('resetting', [
      '--workdir',
      metadata.disposableRoot,
      'db',
      'reset',
    ]);
    const testArgs = ['--workdir', metadata.disposableRoot, 'test', 'db'];
    if (metadata.testPath) {
      testArgs.push(metadata.testPath);
    }
    await run('testing', testArgs);
    if (metadata.typegenOutput) {
      await updateMetadata(metadata.disposableRoot, {
        ...metadata,
        status: 'typegen',
      });
      try {
        await typegen({ binaryPath, metadata });
      } catch (error) {
        originalCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
        throw error;
      }
      if (requestedSignal) {
        originalCode = signalExitCode(requestedSignal);
        throw new Error(`Interrupted by ${requestedSignal}.`);
      }
    }
  } catch (error) {
    if (originalCode === 0) {
      originalCode = 1;
    }
    stderr.write(`${error instanceof Error ? error.message : error}\n`);
  } finally {
    removeSignalHandlers();
    if (startAttempted) {
      const cleanup = await runner(
        binaryPath,
        [
          '--workdir',
          metadata.disposableRoot,
          'stop',
          '--project-id',
          metadata.projectId,
          '--no-backup',
        ],
        metadata.disposableRoot
      );
      if (cleanup.code !== 0 && originalCode === 0) {
        originalCode = cleanup.code;
      }
      if (cleanup.code !== 0) {
        cleanupSucceeded = false;
        stderr.write(
          `Scoped cleanup failed; recovery metadata remains at ${metadata.disposableRoot}.\n`
        );
      }
    }
    if (cleanupSucceeded) {
      await removeRoot(metadata.disposableRoot);
    }
  }

  return originalCode;
}

export async function cleanupInterruptedProject({
  binaryPath,
  metadata,
  removeRoot = removeDisposableRoot,
  runner = runIsolatedCommand,
}) {
  const result = await runner(
    binaryPath,
    [
      '--workdir',
      metadata.disposableRoot,
      'stop',
      '--project-id',
      metadata.projectId,
      '--no-backup',
    ],
    metadata.disposableRoot
  );
  if (result.code === 0) {
    await removeRoot(metadata.disposableRoot);
  }
  return result.code;
}

export function parseArguments(argv) {
  const result = {
    cleanupRoot: null,
    resumeRoot: null,
    testPath: null,
    typegenOutput: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (
      !['--cleanup', '--resume', '--test', '--typegen'].includes(argument) ||
      !value
    ) {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
    if (argument === '--cleanup') result.cleanupRoot = value;
    if (argument === '--resume') result.resumeRoot = value;
    if (argument === '--test') result.testPath = value;
    if (argument === '--typegen') result.typegenOutput = value;
    index += 1;
  }
  if (
    result.cleanupRoot &&
    (result.resumeRoot || result.testPath || result.typegenOutput)
  ) {
    throw new Error(
      '--cleanup cannot be combined with --resume, --test, or --typegen.'
    );
  }
  return result;
}

function gitValue(repositoryRoot, args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

export async function main(
  argv = process.argv.slice(2),
  {
    binaryResolver = ensureSupabaseBinary,
    containerNames = listDockerContainerNames,
    stderr = process.stderr,
    stdout = process.stdout,
  } = {}
) {
  try {
    const options = parseArguments(argv);
    const repositoryRoot = path.resolve(workspaceDir, '..', '..');
    const typegenOutput = validateTypegenOutputPath(
      repositoryRoot,
      options.typegenOutput
    );
    const binaryPath = await binaryResolver(workspaceDir);

    if (options.cleanupRoot) {
      const metadata = await readLifecycleMetadata(options.cleanupRoot);
      return cleanupInterruptedProject({ binaryPath, metadata });
    }

    let metadata;
    if (options.resumeRoot) {
      metadata = await readLifecycleMetadata(options.resumeRoot);
      if (options.testPath) {
        metadata = {
          ...metadata,
          testPath: validateFocusedTestPath(repositoryRoot, options.testPath),
        };
      }
      if (typegenOutput) {
        metadata = { ...metadata, typegenOutput };
      } else if (metadata.typegenOutput) {
        validateTypegenOutputPath(repositoryRoot, metadata.typegenOutput);
      }
    } else {
      const headSha = gitValue(repositoryRoot, ['rev-parse', 'HEAD']);
      const identity = deriveIsolatedIdentity({
        headSha,
        repositoryPath: repositoryRoot,
      });
      if (hasProjectCollision(identity.projectId, containerNames())) {
        throw new Error(
          `Isolated Supabase project ${identity.projectId} already exists. Resume or clean its recorded disposable root instead of reusing it.`
        );
      }
      const portBlock = await chooseAvailablePortBlock(identity);
      const testPath = validateFocusedTestPath(
        repositoryRoot,
        options.testPath
      );
      metadata = await stageDisposableProject({
        basePort: portBlock.basePort,
        headSha,
        projectId: identity.projectId,
        repositoryRoot,
        testPath,
        typegenOutput,
      });
    }

    stdout.write(`Isolated project: ${metadata.projectId}\n`);
    stdout.write(`Disposable root: ${metadata.disposableRoot}\n`);
    stdout.write(
      `Port block: ${metadata.basePort}-${metadata.basePort + PORT_BLOCK_SIZE - 1}\n`
    );
    return runIsolatedLifecycle({ binaryPath, metadata });
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : error}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = await main();
}

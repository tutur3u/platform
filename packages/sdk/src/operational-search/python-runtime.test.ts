import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { bytesHash } from './cache';
import {
  PYTHON_ADAPTER_CODE,
  PYTHON_ADAPTER_HASH,
  PYTHON_INSTALLATION_MANIFEST,
  PYTHON_INSTALLATION_MANIFEST_HASH,
  PYTHON_RUNTIME_MANIFEST,
  PYTHON_RUNTIME_MANIFEST_HASH,
} from './python-adapter-code';
import {
  authenticatePythonInstallation,
  createRuntimeDiagnosticCollector,
  inspectRuntimeDirectory,
  MAX_RUNTIME_DIAGNOSTIC_BYTES,
} from './python-runtime';

it('reports nonzero and signal failures without retaining private stderr or guessing a cause', () => {
  const privateBytes = Buffer.from(
    'synthetic-private-path prompt-content credential-value https://example.org/?signature=synthetic-private'
  );
  const collector = createRuntimeDiagnosticCollector();
  expect(collector.receive(privateBytes)).toBe(false);
  const failure = collector.failure(7, null);
  expect(failure.message).toBe('isolated local runtime failed');
  expect(failure.diagnostic).toEqual({
    version: 1,
    category: 'UNKNOWN',
    exitCode: 7,
    signal: null,
    stderrBytes: privateBytes.length,
    stderrHashedBytes: privateBytes.length,
    stderrSha256: bytesHash(privateBytes),
    stderrTruncated: false,
  });
  expect(JSON.stringify(failure)).not.toContain('synthetic-private');
  expect(collector.failure(null, 'SIGXFSZ').diagnostic).toMatchObject({
    category: 'UNKNOWN',
    exitCode: null,
    signal: 'SIGXFSZ',
  });
  expect(collector.failure(-2, null, 'SPAWN_FAILURE').diagnostic).toMatchObject(
    {
      category: 'SPAWN_FAILURE',
      exitCode: null,
    }
  );
});

it('hashes only the bounded stderr prefix while counting received bytes and truncation', () => {
  const collector = createRuntimeDiagnosticCollector();
  const prefix = Buffer.alloc(MAX_RUNTIME_DIAGNOSTIC_BYTES, 'x');
  expect(collector.receive(prefix.subarray(0, 100))).toBe(false);
  expect(collector.receive(prefix.subarray(100))).toBe(false);
  const excess = Buffer.from('synthetic-private-after-bound');
  expect(collector.receive(excess)).toBe(true);
  expect(collector.receive(excess)).toBe(true);
  expect(collector.failure(null, 'SIGKILL', 'STDERR_LIMIT').diagnostic).toEqual(
    {
      version: 1,
      category: 'STDERR_LIMIT',
      exitCode: null,
      signal: 'SIGKILL',
      stderrBytes: prefix.length + excess.length * 2,
      stderrHashedBytes: MAX_RUNTIME_DIAGNOSTIC_BYTES,
      stderrSha256: bytesHash(prefix),
      stderrTruncated: true,
    }
  );
});

it('ships exact owned adapter source with deterministic hash through TypeScript packaging', () => {
  const source = readFileSync(
    join(import.meta.dirname, 'python-adapter.py'),
    'utf8'
  );
  expect(PYTHON_ADAPTER_CODE).toBe(source);
  expect(PYTHON_ADAPTER_HASH).toBe(bytesHash(Buffer.from(source)));
  expect(PYTHON_ADAPTER_CODE).toContain('InputOverflowStrategy.ERROR');
  expect(PYTHON_ADAPTER_CODE).toContain(
    'resource.setrlimit(resource.RLIMIT_CPU, (20, 20))'
  );
});

it('embeds unchanged manifest bytes and regenerates identical resources offline', () => {
  for (const [filename, embedded, hash] of [
    [
      'python-runtime-manifest.json',
      PYTHON_RUNTIME_MANIFEST,
      PYTHON_RUNTIME_MANIFEST_HASH,
    ],
    [
      'python-installation-manifest.json',
      PYTHON_INSTALLATION_MANIFEST,
      PYTHON_INSTALLATION_MANIFEST_HASH,
    ],
  ] as const) {
    const bytes = readFileSync(join(import.meta.dirname, filename));
    expect(bytesHash(bytes)).toBe(hash);
    expect(embedded).toEqual(JSON.parse(bytes.toString('utf8')));
  }
  const directory = mkdtempSync(join(tmpdir(), 'ttr-embedded-resources-'));
  const generated = readFileSync(
    join(import.meta.dirname, 'python-adapter-code.ts'),
    'utf8'
  );
  try {
    for (const filename of ['first.ts', 'second.ts']) {
      const output = join(directory, filename);
      execFileSync(
        process.env.TTR_TEST_PYTHON ?? 'python3',
        [
          '-I',
          '-B',
          '-c',
          'import runpy,sys,urllib.request; urllib.request.urlopen=lambda *a,**k: (_ for _ in ()).throw(RuntimeError("network forbidden")); sys.argv=sys.argv[1:]; runpy.run_path(sys.argv[0],run_name="__main__")',
          join(import.meta.dirname, 'prepare-python-runtime.py'),
          '--embed-only',
          '--embed-adapter',
          output,
        ],
        { timeout: 5000, maxBuffer: 4096 }
      );
      expect(readFileSync(output, 'utf8')).toBe(generated);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('rejects a fake same-version interpreter before any execution or child self-report', async () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-fake-runtime-'))
  );
  try {
    const bin = join(directory, 'venv', 'bin');
    mkdirSync(bin, { recursive: true, mode: 0o700 });
    const executable = join(bin, 'python');
    writeFileSync(executable, '#!/bin/sh\necho forged-probe\n', {
      mode: 0o700,
    });
    await expect(authenticatePythonInstallation(directory)).rejects.toThrow(
      'interpreter differs'
    );
    expect(readFileSync(executable, 'utf8')).toBe(
      '#!/bin/sh\necho forged-probe\n'
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('rejects an expired absolute command deadline before reading or launching a runtime', async () => {
  await expect(
    authenticatePythonInstallation('/never-opened-expired-runtime', 0)
  ).rejects.toThrow('absolute runtime command deadline');
});

it('requires a private explicit runtime root and counts only its finite own storage', () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-runtime-capacity-'))
  );
  try {
    writeFileSync(join(directory, 'synthetic'), '123', { mode: 0o600 });
    expect(inspectRuntimeDirectory(directory)).toMatchObject({
      root: directory,
      bytes: 3,
    });
    chmodSync(directory, 0o755);
    expect(() => inspectRuntimeDirectory(directory)).toThrow('0700');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

import { execFileSync } from 'node:child_process';

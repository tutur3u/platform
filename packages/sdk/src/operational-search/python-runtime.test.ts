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
} from './python-adapter-code';
import {
  authenticatePythonInstallation,
  inspectRuntimeDirectory,
} from './python-runtime';

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

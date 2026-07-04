#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const workspaceDir = path.resolve(__dirname, '..');

const SUPABASE_CLI_PLATFORMS = {
  darwin: { arm64: ['darwin-arm64'], x64: ['darwin-x64'] },
  linux: {
    arm64: ['linux-arm64', 'linux-arm64-musl'],
    x64: ['linux-x64', 'linux-x64-musl'],
  },
  win32: { arm64: ['windows-arm64'], x64: ['windows-x64'] },
};

function getSupabaseGoBinaryName(platform = process.platform) {
  return platform === 'win32' ? 'supabase-go.exe' : 'supabase-go';
}

export function getSupabaseWrapperPath(baseWorkspaceDir = workspaceDir) {
  const supabasePackageDir = path.join(
    baseWorkspaceDir,
    'node_modules',
    'supabase'
  );
  const packageJsonPath = path.join(supabasePackageDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const binaryRelativePath =
    process.platform === 'win32'
      ? `${packageJson.bin.supabase}.exe`
      : packageJson.bin.supabase;

  return path.join(supabasePackageDir, binaryRelativePath);
}

export function getBundledSupabaseGoPath(
  wrapperPath,
  {
    arch = os.arch(),
    existsSync = fs.existsSync,
    platform = process.platform,
    realpathSync = fs.realpathSync,
    requireFactory = createRequire,
  } = {}
) {
  const platformCandidates = SUPABASE_CLI_PLATFORMS[platform]?.[arch] ?? [];

  if (platformCandidates.length === 0) {
    return null;
  }

  const requireFromWrapper = requireFactory(realpathSync(wrapperPath));

  for (const suffix of platformCandidates) {
    try {
      const packageJsonPath = requireFromWrapper.resolve(
        `@supabase/cli-${suffix}/package.json`
      );
      const binaryPath = path.join(
        path.dirname(packageJsonPath),
        'bin',
        getSupabaseGoBinaryName(platform)
      );

      if (existsSync(binaryPath)) {
        return binaryPath;
      }
    } catch {
      // Try the next platform package candidate.
    }
  }

  return null;
}

export function getSupabaseBinaryPath(
  baseWorkspaceDir = workspaceDir,
  { env = process.env, ...nativeOptions } = {}
) {
  const overridePath = env.SUPABASE_CLI_BINARY_OVERRIDE?.trim();

  if (overridePath) {
    return overridePath;
  }

  const wrapperPath = getSupabaseWrapperPath(baseWorkspaceDir);

  return getBundledSupabaseGoPath(wrapperPath, nativeOptions) ?? wrapperPath;
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({
        code: code ?? 1,
        signal: signal ?? null,
      });
    });
  });
}

export async function ensureSupabaseBinary(
  baseWorkspaceDir = workspaceDir,
  { runner = run, ...nativeOptions } = {}
) {
  const binaryPath = getSupabaseBinaryPath(baseWorkspaceDir, nativeOptions);

  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  const supabasePackageDir = path.join(
    baseWorkspaceDir,
    'node_modules',
    'supabase'
  );
  const installerPath = path.join(
    supabasePackageDir,
    'scripts',
    'postinstall.js'
  );
  const result = await runner(
    process.execPath,
    [installerPath],
    supabasePackageDir
  );

  if (result.code !== 0 || !fs.existsSync(binaryPath)) {
    throw new Error(
      'Supabase CLI binary is unavailable. Re-run `bun install` or check the package postinstall logs.'
    );
  }

  return binaryPath;
}

export async function main(
  argv = process.argv.slice(2),
  { runner = run, stderr = process.stderr } = {}
) {
  try {
    const binaryPath = await ensureSupabaseBinary();
    const result = await runner(binaryPath, argv, workspaceDir);
    return result.code;
  } catch (error) {
    stderr.write(
      error instanceof Error ? error.message : 'Failed to run Supabase CLI.'
    );
    stderr.write('\n');
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = await main();
}

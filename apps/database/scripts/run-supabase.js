#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceDir = path.resolve(__dirname, '..');
const supabasePackageDir = path.join(workspaceDir, 'node_modules', 'supabase');

function getSupabaseBinaryPath() {
  const packageJsonPath = path.join(supabasePackageDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const binaryRelativePath =
    process.platform === 'win32'
      ? `${packageJson.bin.supabase}.exe`
      : packageJson.bin.supabase;

  return path.join(supabasePackageDir, binaryRelativePath);
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

async function ensureSupabaseBinary() {
  const binaryPath = getSupabaseBinaryPath();

  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  const installerPath = path.join(
    supabasePackageDir,
    'scripts',
    'postinstall.js'
  );
  const result = await run(
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

async function main(argv = process.argv.slice(2)) {
  try {
    const binaryPath = await ensureSupabaseBinary();
    const result = await run(binaryPath, argv, workspaceDir);
    process.exitCode = result.code;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Failed to run Supabase CLI.'
    );
    process.exitCode = 1;
  }
}

await main();

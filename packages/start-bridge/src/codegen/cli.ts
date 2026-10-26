#!/usr/bin/env bun
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { planRegistries, type RegistryConfig } from './registry';

export const CONFIG_FILE = 'start-bridge.routes.json';

function walk(root: string, directory = root): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return walk(root, path);
    return [relative(root, path).split(sep).join('/')];
  });
}

/** Reads a file, or `null` when it does not exist (no check-then-use race). */
function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Generates (`write`) or verifies the registries of one app directory. */
export function runRegistries(appRoot: string, mode: 'generate' | 'check') {
  const configPath = join(appRoot, CONFIG_FILE);
  const configSource = readIfPresent(configPath);
  if (configSource === null) return [`${appRoot}: missing ${CONFIG_FILE}`];
  const config = JSON.parse(configSource) as RegistryConfig;
  const errors: string[] = [];
  let files: string[] = [];
  if (config.appDir !== null) {
    const appDir = join(appRoot, config.appDir ?? 'src/app');
    // Fail in both modes, before anything is written.
    if (!existsSync(appDir) || !statSync(appDir).isDirectory())
      return [
        `${config.appDir ?? 'src/app'}: App Router directory is missing or not a directory; set "appDir": null for an app without one`,
      ];
    files = walk(appDir);
  }
  const plan = planRegistries(
    { ...config, appDir: config.appDir ?? 'src/app' },
    files,
    (path) => existsSync(join(appRoot, path)),
    (path) => readFileSync(join(appRoot, path), 'utf8')
  );
  errors.push(...plan.errors);
  for (const output of plan.generated) {
    const path = join(appRoot, output.path);
    const current = readIfPresent(path);
    if (current === output.content) continue;
    if (mode === 'generate') writeFileSync(path, output.content);
    else
      errors.push(
        `${output.path}: stale; run start-bridge-routes generate ${appRoot}`
      );
  }
  return errors;
}

if (import.meta.main) {
  const [mode, ...apps] = process.argv.slice(2);
  if ((mode !== 'generate' && mode !== 'check') || apps.length === 0) {
    console.error('Usage: start-bridge-routes <generate|check> <app-dir>...');
    process.exit(2);
  }
  let failed = false;
  for (const app of apps) {
    const errors = runRegistries(resolve(app), mode);
    for (const error of errors) console.error(`${app}: ${error}`);
    failed ||= errors.length > 0;
    if (!errors.length)
      console.log(
        `${app}: registries ${mode === 'check' ? 'current' : 'written'}`
      );
  }
  process.exit(failed ? 1 : 0);
}

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

/** Generates (`write`) or verifies the registries of one app directory. */
export function runRegistries(appRoot: string, mode: 'generate' | 'check') {
  const configPath = join(appRoot, CONFIG_FILE);
  if (!existsSync(configPath)) return [`${appRoot}: missing ${CONFIG_FILE}`];
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as RegistryConfig;
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
    (path) => existsSync(join(appRoot, path))
  );
  errors.push(...plan.errors);
  for (const output of plan.generated) {
    const path = join(appRoot, output.path);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
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

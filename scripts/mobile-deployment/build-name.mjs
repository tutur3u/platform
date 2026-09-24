#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function buildNameForBuild(pubspec, buildNumber) {
  if (!/^[1-9]\d*$/u.test(String(buildNumber))) {
    throw new Error('A positive store build number is required');
  }
  const version = pubspec.match(
    /^version:\s*(\d+)\.(\d+)\.\d+(?:\+\d+)?\s*$/mu
  );
  if (!version)
    throw new Error('Mobile pubspec version must be major.minor.patch');
  return `${version[1]}.${version[2]}.${buildNumber}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const pubspec = await readFile(
      new URL('../../apps/mobile/pubspec.yaml', import.meta.url),
      'utf8'
    );
    process.stdout.write(buildNameForBuild(pubspec, process.argv[2]));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

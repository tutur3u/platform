import { createRequire } from 'node:module';
import path from 'node:path';
import type { NextConfig } from 'next';
import type { TurbopackOfflineConfig } from './types';

const require = createRequire(__filename);
const esbuildWasmPackageRoot = path.dirname(
  require.resolve('esbuild-wasm/package.json')
);
const esbuildWasmSidecars = [
  'wasm_exec_node.js',
  'wasm_exec.js',
  'esbuild.wasm',
] as const;

function getWorkerTracingIncludes(
  projectRoot: string,
  workerSource: string
): NonNullable<NextConfig['outputFileTracingIncludes']> {
  const paths = [
    path.resolve(projectRoot, workerSource),
    ...esbuildWasmSidecars.map((sidecar) =>
      path.join(esbuildWasmPackageRoot, sidecar)
    ),
  ].map((absolutePath) => {
    const relative = path
      .relative(projectRoot, absolutePath)
      .split(path.sep)
      .join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
  });

  return { '/serwist/*': paths };
}

function mergeOutputFileTracingIncludes(
  first: NonNullable<NextConfig['outputFileTracingIncludes']>,
  second: TurbopackOfflineConfig['outputFileTracingIncludes']
): NonNullable<NextConfig['outputFileTracingIncludes']> {
  const merged: NonNullable<NextConfig['outputFileTracingIncludes']> = {};
  const keys = new Set([...Object.keys(first), ...Object.keys(second ?? {})]);

  for (const key of keys) {
    merged[key] = Array.from(
      new Set([...(first[key] ?? []), ...(second?.[key] ?? [])])
    );
  }

  return merged;
}

/** Returns the Next.js tracing configuration for the internal worker compiler. */
export function getOfflineTurbopackConfig(
  config: TurbopackOfflineConfig = {}
): Partial<NextConfig> {
  const {
    additionalExternalPackages = [],
    outputFileTracingIncludes,
    outputFileTracingRoot,
    projectRoot = process.cwd(),
    workerSource = 'src/app/sw.ts',
  } = config;

  return {
    ...(outputFileTracingRoot
      ? { outputFileTracingRoot: path.resolve(outputFileTracingRoot) }
      : {}),
    serverExternalPackages: ['esbuild-wasm', ...additionalExternalPackages],
    outputFileTracingIncludes: mergeOutputFileTracingIncludes(
      getWorkerTracingIncludes(path.resolve(projectRoot), workerSource),
      outputFileTracingIncludes
    ),
  };
}

/** @deprecated Use `getOfflineTurbopackConfig`. */
export const getTurbopackConfig = getOfflineTurbopackConfig;

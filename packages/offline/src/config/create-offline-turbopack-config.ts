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

function getEsbuildWasmTracingIncludes(
  projectRoot: string
): NonNullable<NextConfig['outputFileTracingIncludes']> {
  const paths = esbuildWasmSidecars.map((sidecar) => {
    const relative = path
      .relative(projectRoot, path.join(esbuildWasmPackageRoot, sidecar))
      .split(path.sep)
      .join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
  });

  return { '/serwist/[path]': paths };
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
    projectRoot = process.cwd(),
  } = config;

  return {
    serverExternalPackages: ['esbuild-wasm', ...additionalExternalPackages],
    outputFileTracingIncludes: mergeOutputFileTracingIncludes(
      getEsbuildWasmTracingIncludes(path.resolve(projectRoot)),
      outputFileTracingIncludes
    ),
  };
}

/** @deprecated Use `getOfflineTurbopackConfig`. */
export const getTurbopackConfig = getOfflineTurbopackConfig;

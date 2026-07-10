import { createRequire } from 'node:module';
import path from 'node:path';
import type { NextConfig } from 'next';
import type { TurbopackSerwistConfig } from './types';

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
  const relativeSidecarPaths = esbuildWasmSidecars.map((sidecar) => {
    const relativePath = path.relative(
      projectRoot,
      path.join(esbuildWasmPackageRoot, sidecar)
    );
    const normalizedPath = relativePath.split(path.sep).join('/');

    return normalizedPath.startsWith('.')
      ? normalizedPath
      : `./${normalizedPath}`;
  });

  return {
    '/serwist/[path]': relativeSidecarPaths,
  };
}

function mergeOutputFileTracingIncludes(
  first: NonNullable<NextConfig['outputFileTracingIncludes']>,
  second: TurbopackSerwistConfig['outputFileTracingIncludes']
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

/**
 * Gets the Next.js configuration additions required for Serwist with Turbopack.
 *
 * Unlike the webpack-based approach, this doesn't wrap your config.
 * Instead, it returns configuration to merge with your existing Next.js config.
 *
 * @param config - Configuration options
 * @returns Partial Next.js configuration to merge
 *
 * @example
 * ```ts
 * // In your next.config.ts:
 * import { getTurbopackConfig } from '@tuturuuu/offline/config';
 *
 * const serwistConfig = getTurbopackConfig();
 *
 * const nextConfig: NextConfig = {
 *   ...serwistConfig,
 *   // Your other config
 * };
 *
 * export default nextConfig;
 * ```
 */
export function getTurbopackConfig(
  config: TurbopackSerwistConfig = {}
): Partial<NextConfig> {
  const {
    additionalExternalPackages = [],
    outputFileTracingIncludes,
    projectRoot = process.cwd(),
  } = config;

  return {
    // esbuild-wasm is required for on-the-fly service worker compilation
    serverExternalPackages: ['esbuild-wasm', ...additionalExternalPackages],
    outputFileTracingIncludes: mergeOutputFileTracingIncludes(
      getEsbuildWasmTracingIncludes(path.resolve(projectRoot)),
      outputFileTracingIncludes
    ),
  };
}

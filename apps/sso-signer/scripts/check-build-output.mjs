#!/usr/bin/env node
/**
 * Fails the signer Worker build when the emitted artifact still contains the
 * unchecked transaction path. `vp build` compiles `__SSO_SIGNER_UNCHECKED__`
 * to `false` and drops the branch; this scans the REAL output that
 * `cf deploy --prebuilt` publishes (`.cloudflare/output`) and `dist`, and
 * refuses when a marker is present or when `.cloudflare/output` holds no
 * emitted script (a `dist`-only build is not what gets deployed). It runs
 * as part of the package `build` script, so every build of the Worker (local
 * or CI) is checked.
 *
 * Usage: node scripts/check-build-output.mjs [appDir]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FORBIDDEN_MARKERS = Object.freeze([
  'unchecked-local',
  '__SSO_SIGNER_UNCHECKED__',
]);
/** What `cf deploy --prebuilt` publishes; it must hold at least one script. */
export const DEPLOYED_OUTPUT_DIR = '.cloudflare/output';
export const OUTPUT_DIRS = Object.freeze([DEPLOYED_OUTPUT_DIR, 'dist']);
/**
 * Files that count as an emitted Worker script. Source maps are not scripts:
 * a `.map` alone must not satisfy the deployed-script requirement. Every file
 * (maps included) is still scanned for the forbidden markers.
 */
const SCRIPT = /\.(?:m?js|cjs|wasm)$/u;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/**
 * Scans the emitted output under `appDir`. Returns the scanned script count,
 * the count under `.cloudflare/output` alone (`deployedScripts === 0` means
 * nothing deployable was emitted) and every (file, marker) hit.
 */
export function scanBuildOutput(appDir) {
  const hits = [];
  let scripts = 0;
  let deployedScripts = 0;
  for (const dir of OUTPUT_DIRS) {
    const root = join(appDir, dir);
    if (!existsSync(root) || !statSync(root).isDirectory()) continue;
    for (const file of walk(root)) {
      if (SCRIPT.test(file)) {
        scripts += 1;
        if (dir === DEPLOYED_OUTPUT_DIR) deployedScripts += 1;
      }
      const text = readFileSync(file, 'latin1');
      for (const marker of FORBIDDEN_MARKERS) {
        if (text.includes(marker)) {
          hits.push({ file: relative(appDir, file), marker });
        }
      }
    }
  }
  return { scripts, deployedScripts, hits };
}

export function checkBuildOutput(appDir) {
  const { scripts, deployedScripts, hits } = scanBuildOutput(appDir);
  if (deployedScripts === 0) {
    return {
      ok: false,
      message: `no emitted Worker script under ${DEPLOYED_OUTPUT_DIR} (what cf deploy --prebuilt publishes)`,
    };
  }
  if (hits.length > 0) {
    return {
      ok: false,
      message: hits
        .map(({ file, marker }) => `${file} contains ${marker}`)
        .join('\n'),
    };
  }
  return {
    ok: true,
    message: `${scripts} script(s) checked, ${deployedScripts} under ${DEPLOYED_OUTPUT_DIR}`,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const appDir = resolve(
    process.argv[2] ?? join(fileURLToPath(import.meta.url), '..', '..')
  );
  const result = checkBuildOutput(appDir);
  if (result.ok) {
    console.info(`[sso-signer] build output clean: ${result.message}`);
  } else {
    console.error(`[sso-signer] build output refused:\n${result.message}`);
    process.exitCode = 1;
  }
}

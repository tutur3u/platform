// Exact paths audited as Vitest-only, with no runtime source/manifest references.
// Recheck imports, entry points and runtime globs before extending this list.
// Unlisted tests, snapshots, manifests and build inputs keep normal selection.
const verifiedProductionTestPaths = new Set([
  'apps/tools/src/app/[locale]/random/page.test.ts',
  'apps/tools/src/app/[locale]/random/random-generator.test.ts',
  'apps/tools/src/app/[locale]/random/random-generator-client.test.tsx',
]);

export function isVerifiedProductionTestPath(filePath: string): boolean {
  return verifiedProductionTestPaths.has(filePath);
}

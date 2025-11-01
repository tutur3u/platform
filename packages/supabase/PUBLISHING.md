# Publishing Guide for @tuturuuu/supabase

This document provides step-by-step instructions for publishing the `@tuturuuu/supabase` package to npm.

## Important Note

This package requires compilation before use. Both in the monorepo and when published to npm, it uses the compiled `dist/` files. The `prepublishOnly` script ensures a fresh build before every publish.

## Pre-Publishing Checklist

Before publishing, ensure all the following items are checked:

### 1. Package Configuration ✅
- [x] `package.json` has correct version number
- [x] All metadata fields are filled (description, keywords, repository, etc.)
- [x] `files` field specifies what to include in the package
- [x] `exports` field properly maps all module paths
- [x] Peer dependencies are correctly specified
- [x] License is specified and LICENSE file exists

### 2. Documentation ✅
- [x] README.md is comprehensive with usage examples
- [x] CHANGELOG.md is updated with latest changes
- [x] API documentation is complete
- [x] TypeScript types are properly documented

### 3. Code Quality ✅
- [x] TypeScript compiles without errors (`bun run type-check`)
- [x] All tests pass (`bun run test`)
- [x] Build process succeeds (`bun run build`)
- [x] Build output exists in `dist/` directory

### 4. Dependencies
- [x] All dependencies are at correct versions
- [x] No security vulnerabilities in dependencies
- [x] Workspace dependencies (`@tuturuuu/types`) will be resolved correctly

## Publishing Steps

### Step 1: Update Version

Update the version in `package.json` following [Semantic Versioning](https://semver.org/):

- **Patch** (0.1.2 → 0.1.3): Bug fixes, minor changes
- **Minor** (0.1.2 → 0.2.0): New features, backward compatible
- **Major** (0.1.2 → 1.0.0): Breaking changes

```bash
# Update version manually in package.json or use npm version
cd packages/supabase
npm version patch  # or minor, or major
```

### Step 2: Update CHANGELOG.md

Document all changes in `CHANGELOG.md` following Keep a Changelog format:

```markdown
## [0.1.3] - 2025-01-XX

### Added
- New feature X

### Changed
- Updated Y

### Fixed
- Bug Z
```

### Step 3: Build the Package

Run the build process to generate distribution files:

```bash
cd packages/supabase
bun run build
```

This will:
1. Clean previous build artifacts
2. Compile TypeScript to JavaScript
3. Generate type definition files (.d.ts)
4. Output everything to the `dist/` directory

### Step 4: Verify Build Output

Check that the build was successful:

```bash
ls -la dist/
```

You should see:
- `index.js` and `index.d.ts`
- `next/` directory with all modules compiled
- Proper directory structure mirroring source

### Step 5: Test Local Installation (Optional)

Test the package locally before publishing:

```bash
# In the package directory
npm pack

# This creates a .tgz file, e.g., tuturuuu-supabase-0.1.2.tgz
# Install it in a test project
cd /path/to/test-project
npm install /path/to/packages/supabase/tuturuuu-supabase-0.1.2.tgz
```

### Step 6: Login to npm

Ensure you're logged in to npm with an account that has publish permissions:

```bash
npm whoami  # Check if you're logged in
npm login   # If not logged in
```

### Step 7: Publish to npm

**DRY RUN (Recommended First):**

```bash
cd packages/supabase
npm publish --dry-run
```

This shows what will be published without actually publishing.

**ACTUAL PUBLISH:**

```bash
npm publish
```

The `prepublishOnly` script will automatically:
1. Clean the dist directory
2. Run a fresh build with TypeScript compiler
3. Finally, the package is published with compiled `dist/` files

### Step 8: Verify Publication

After publishing:

1. Check the package on npm: https://www.npmjs.com/package/@tuturuuu/supabase
2. Verify the version is correct
3. Check that all files are included
4. Test installation in a fresh project:

```bash
npm install @tuturuuu/supabase@latest
```

### Step 9: Tag and Push Git Changes

```bash
# Tag the release
git tag -a @tuturuuu/supabase@0.1.2 -m "Release @tuturuuu/supabase v0.1.2"

# Push the tag
git push origin @tuturuuu/supabase@0.1.2

# Or push all tags
git push --tags
```

### Step 10: Create GitHub Release (Optional)

Create a release on GitHub with:
- Tag version
- Release notes from CHANGELOG.md
- Any additional notes or migration guides

## Handling Workspace Dependencies

The package depends on `@tuturuuu/types` with `workspace:*`. When publishing:

1. **Ensure @tuturuuu/types is published first** if it has changes
2. npm will automatically resolve `workspace:*` to the latest published version
3. If you need a specific version, manually update before publishing

## Troubleshooting

### Build Fails

```bash
# Clean and rebuild
bun run clean
bun install
bun run build
```

### Type Errors

```bash
# Run type check to see specific errors
bun run type-check
```

### Workspace Dependency Issues

If the build can't find `@tuturuuu/types`:

```bash
# Rebuild from the monorepo root
cd ../..
bun install
bun run build
```

### Publishing Permissions

If you get permission errors:
1. Ensure you're logged in: `npm whoami`
2. Verify you have access: `npm owner ls @tuturuuu/supabase`
3. Request access from package owner if needed

## Post-Publishing

After successful publication:

1. ✅ Update internal projects to use the new version
2. ✅ Monitor for issues and bug reports
3. ✅ Update documentation site if applicable
4. ✅ Announce the release to the team

## Rollback

If you need to unpublish or deprecate a version:

```bash
# Deprecate a version (recommended over unpublish)
npm deprecate @tuturuuu/supabase@0.1.2 "Please upgrade to 0.1.3"

# Unpublish (only within 72 hours of publishing)
npm unpublish @tuturuuu/supabase@0.1.2
```

**Note:** Unpublishing is not recommended as it breaks existing installations. Use deprecation instead.

## References

- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [npm CLI Documentation](https://docs.npmjs.com/cli/)

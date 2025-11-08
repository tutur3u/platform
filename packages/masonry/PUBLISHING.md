# Publishing @tuturuuu/masonry

This document describes the process for publishing updates to the `@tuturuuu/masonry` package.

## Prerequisites

- npm account with access to the `@tuturuuu` organization
- Logged in to npm: `npm login`

## Publishing Steps

1. **Update Version**
   ```bash
   # Update version in package.json
   # Follow semantic versioning:
   # - PATCH: Bug fixes (0.0.x)
   # - MINOR: New features, backwards compatible (0.x.0)
   # - MAJOR: Breaking changes (x.0.0)
   ```

2. **Run Tests**
   ```bash
   bun run test
   ```

3. **Build**
   ```bash
   bun run build
   ```

4. **Verify Build**
   ```bash
   # Check that dist/ contains all necessary files
   ls -la dist/
   ```

5. **Publish**
   ```bash
   npm publish
   ```

   The `prepublishOnly` script will automatically:
   - Clean previous build artifacts
   - Run a fresh build

## What Gets Published

The following files are included in the npm package (see `files` in package.json):
- `dist/` - Compiled JavaScript and TypeScript declarations
- `README.md` - Package documentation

The following are excluded (see `.npmignore`):
- Source TypeScript files (`src/`)
- Test files
- Configuration files
- Development dependencies

## Versioning Guidelines

- **Patch (0.0.x)**: Bug fixes, documentation updates
- **Minor (0.x.0)**: New features, non-breaking changes
- **Major (x.0.0)**: Breaking API changes

## Verify Published Package

After publishing, verify the package:
```bash
npm view @tuturuuu/masonry
```

## Troubleshooting

### Build Failures
- Ensure all TypeScript errors are resolved
- Check that `tsconfig.build.json` excludes test files

### Publishing Failures
- Verify you're logged in: `npm whoami`
- Ensure version number is incremented
- Check that you have publish access to @tuturuuu organization

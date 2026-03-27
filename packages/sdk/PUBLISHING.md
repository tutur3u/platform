# Publishing Guide for tuturuuu SDK

This guide explains how to publish the `tuturuuu` package to npm.

## Prerequisites

1. **npm Account**: Create an account at [npmjs.com](https://www.npmjs.com/signup)
2. **npm Authentication**: Log in to npm CLI

   ```bash
   npm login
   ```

3. **Package Name Availability**: Verify the name `tuturuuu` is available (or update `name` in package.json)

## Pre-Publishing Checklist

Before publishing, ensure:

- [ ] All tests pass: `bun test`
- [ ] Version number is updated in `package.json`
- [ ] CHANGELOG or release notes are updated
- [ ] README.md is up to date
- [ ] LICENSE file exists
- [ ] `npm pack --dry-run` includes both `dist/` and `src/`

## Publishing Steps

### 1. Clean Build

```bash
cd packages/sdk
bun run clean
```

### 2. Run Tests

```bash
bun test
```

### 3. Build Package

```bash
npm pack --dry-run
```

`prepack` runs the clean build automatically, so `npm pack --dry-run` is the canonical way to verify the published artifact.

### 4. Verify Package Contents (Optional)

Create a tarball to inspect what will be published:

```bash
npm pack
```

This creates a `.tgz` file. Extract and inspect:

```bash
tar -xzf tuturuuu-0.0.1.tgz
ls -la package/
```

### 5. Update Version

Follow semantic versioning:

- **Patch** (0.0.x): Bug fixes
- **Minor** (0.x.0): New features, backward compatible
- **Major** (x.0.0): Breaking changes

```bash
# Bump patch version (0.0.1 -> 0.0.2)
npm version patch

# Bump minor version (0.0.1 -> 0.1.0)
npm version minor

# Bump major version (0.0.1 -> 1.0.0)
npm version major

# Or manually edit package.json and commit
```

### 6. Publish to npm

```bash
npm publish
```

For pre-release versions:

```bash
# Tag as beta
npm publish --tag beta

# Tag as alpha
npm publish --tag alpha
```

### 7. Verify Publication

Check the package on npm:

- <https://www.npmjs.com/package/tuturuuu>
- Install and test: `npm install tuturuuu`

## Automated Publishing (Recommended)

### Option 1: GitHub Actions

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: cd packages/sdk && bun test
      - run: cd packages/sdk && bun run build
      - uses: JS-DevTools/npm-publish@v2
        with:
          token: ${{ secrets.NPM_TOKEN }}
          package: ./packages/sdk/package.json
```

Then:

1. Add `NPM_TOKEN` to GitHub Secrets
2. Create a GitHub Release
3. Package automatically publishes

### Option 2: npm Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "release:patch": "npm version patch && npm publish",
    "release:minor": "npm version minor && npm publish",
    "release:major": "npm version major && npm publish"
  }
}
```

## Post-Publishing

1. **Announce the Release**
   - Update documentation site
   - Post on social media
   - Notify users in Discord/Slack

2. **Monitor for Issues**
   - Watch GitHub issues
   - Check npm download stats
   - Monitor error tracking (if configured)

3. **Tag the Release**

   ```bash
   git tag v0.0.1
   git push --tags
   ```

## Troubleshooting

### "You must be logged in to publish packages"

```bash
npm login
```

### "Package name too similar to existing package"

Update the `name` field in `package.json` or contact npm support.

### "403 Forbidden"

- Check if package name is already taken
- Verify you have permission (for scoped packages)
- Ensure 2FA is set up if required

### Build Errors

```bash
# Clean everything and rebuild
bun run clean
rm -rf node_modules
bun install
bun run build
```

### Import Errors After Publishing

- Verify `exports` field in package.json
- Check that both `dist/` and `src/` are included in the published package
- Test locally: `npm link` in SDK folder, then `npm link tuturuuu` in test project

## Package Structure

After build, the package includes:

```
tuturuuu/
├── dist/           # Compiled JavaScript for Node/npm consumers
│   ├── index.js
│   ├── index.d.ts
│   ├── storage.js
│   ├── storage.d.ts
│   ├── types.js
│   ├── types.d.ts
│   ├── errors.js
│   └── errors.d.ts
├── src/            # Source entrypoints for Bun/type resolution
│   ├── index.ts
│   ├── storage.ts
│   ├── types.ts
│   └── errors.ts
├── README.md       # Package documentation
├── LICENSE         # MIT License
└── package.json    # Package manifest
```

## Version Strategy

For initial release (v0.x.x):

- Start at `0.1.0` for first public release
- Use `0.x.x` during beta phase
- Breaking changes are OK in 0.x versions
- Move to `1.0.0` when API is stable

## Additional Resources

- [npm Publishing Documentation](https://docs.npmjs.com/cli/v10/commands/npm-publish)
- [Semantic Versioning](https://semver.org/)
- [npm Package Best Practices](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)

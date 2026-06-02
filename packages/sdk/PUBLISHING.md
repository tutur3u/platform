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
- [ ] `npm pack --dry-run` includes `dist/`, `README.md`, `LICENSE`, and
      package metadata

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

### Option 1: GitHub Actions (npm Trusted Publishing)

The repository uses `.github/workflows/release-please.yaml` to generate SDK
version and changelog PRs from Conventional Commits on `production`. The SDK is
tracked as the `sdk` component in `release-please-config.json`, with its current
version stored in `.release-please-manifest.json`. When a release-please PR
lands on `production`, `.github/workflows/release-sdk-package.yaml` publishes the
new `packages/sdk/package.json` version to npm. The publish workflow can also be
dispatched manually to catch up a version that already landed on `production`.
Manual dispatches from any other ref are rejected before dependency
installation, packaging, or npm trusted publishing can run. It runs the SDK test
suite, checks whether the exact package version is already present on npm, and
prepares a package tarball with `npm pack` outside the trusted-publish job. The
npm-version check makes workflow changes and manual retries idempotent: if
`tuturuuu@<version>` already exists, the publish job is skipped.

`.github/workflows/sdk-version-bump.yaml` is retired and must not be restored as
a checksum or patch-version generator. Release Please owns SDK version bumps,
changelog updates, tags, and GitHub releases; the SDK package workflow only
publishes an already-landed production version.

The SDK imports local workspace packages whose package exports point at
git-ignored `dist/` output. The release workflow therefore builds
`@tuturuuu/types` and `@tuturuuu/internal-api` in the non-OIDC build and
prepare jobs before running SDK tests or `npm pack`. Do not remove those
dependency-build steps unless SDK tests and package builds stop resolving those
workspace packages through their published-style `dist/` exports.

The final publish job authenticates with npm through
[trusted publishing](https://docs.npmjs.com/trusted-publishers): GitHub Actions
mints a short-lived OIDC token (`id-token: write`) and the npm CLI exchanges it
for a one-shot publish credential. Keep that job limited to downloading the
prepared tarball, verifying its `name` and `version`, checking that the bundled
npm CLI supports trusted publishing, and running
`npm publish ./<tarball> --ignore-scripts` so npm treats the artifact as a
local file path. Do not add dependency installation,
`npm install -g`, `bun install`, package builds, package lifecycle scripts, or
repository secrets to the SDK release workflow. The publish job targets the
GitHub environment
`sdk-release-production`; keep that environment restricted to the `production`
branch in repository settings, and keep the npm trusted publisher bound to the
same environment name so a branch-selected workflow cannot mint a matching npm
publish identity. The job does **not** read an `NPM_TOKEN` secret. Because
`tuturuuu` is a public package and `tutur3u/platform` is a public repository,
npm also generates and attaches build provenance attestations automatically.

To publish a new release:

1. Land Conventional Commits for SDK changes on `production`.
2. Let `.github/workflows/release-please.yaml` open the combined monorepo
   release PR, then merge the PR back to `production`.
3. Confirm `.github/workflows/release-sdk-package.yaml` publishes the new
   `packages/sdk/package.json` version. If the version bump already landed
   without publishing, manually dispatch
   `Release tuturuuu package` from GitHub Actions with the branch selector set
   to `production`.
4. Make sure the npm trusted publisher entry for `tuturuuu` still points at
   `tutur3u/platform` and the workflow filename
   `release-sdk-package.yaml` with GitHub environment
   `sdk-release-production`. Manage it from the package settings page on
   npmjs.com under **Trusted Publisher**.

The npm package settings should keep
**Require two-factor authentication and disallow tokens** enabled so the
package cannot be published with classic tokens. If a release ever needs to be
unblocked manually, re-enable token publishing temporarily and revoke the token
afterward instead of disabling trusted publishing.

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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3](https://github.com/tutur3u/platform/compare/supabase-v0.3.2...supabase-v0.3.3) (2026-06-10)


### Bug Fixes

* **auth:** align web session cookies across supabase origins ([d939a05](https://github.com/tutur3u/platform/commit/d939a055e2ad240b5040ef4ec0aee49267e0bc0f))

## [0.3.2](https://github.com/tutur3u/platform/compare/supabase-v0.3.1...supabase-v0.3.2) (2026-06-10)


### Bug Fixes

* **ci:** auto-recover package release dependencies ([40b2539](https://github.com/tutur3u/platform/commit/40b25390c903194a3c85cc627c737a4acd0d6fa9))

## [0.3.1](https://github.com/tutur3u/platform/compare/supabase-v0.3.0...supabase-v0.3.1) (2026-06-09)


### Bug Fixes

* **ci:** recover releases and package tsgo builds ([d82b846](https://github.com/tutur3u/platform/commit/d82b846c6232d9fb72b7d2aa808020bc24292a19))

## [0.3.0](https://github.com/tutur3u/platform/compare/supabase-v0.2.3...supabase-v0.3.0) (2026-06-08)


### Features

* **auth:** share Supabase cookies across apps ([f72ec8e](https://github.com/tutur3u/platform/commit/f72ec8e7a35f13a301b95b2aa916aefbc5848e6e))


### Bug Fixes

* **auth:** clear duplicate shared supabase cookies ([32fbd04](https://github.com/tutur3u/platform/commit/32fbd046a30fadba98eba278107c334aafcd7bde))
* **auth:** honor forwarded origin for server cookies ([37851e0](https://github.com/tutur3u/platform/commit/37851e075697152b50fc3c711d0c3aa6e8bf5d5c))
* **auth:** preserve satellite Supabase sessions ([a8b49bb](https://github.com/tutur3u/platform/commit/a8b49bb2d29f42b4a0267aadd5d2e2fd1074aeab))
* **auth:** stabilize satellite Supabase sessions ([231c4fa](https://github.com/tutur3u/platform/commit/231c4fac3238b94c96ad8e7a853b03ad97d166e4))
* **ci:** align package provenance metadata ([0f7ef88](https://github.com/tutur3u/platform/commit/0f7ef8834c0054b020c3eaa1042bfcf10145ab1a))
* **ci:** stabilize e2e portless and auth cookies ([79d146a](https://github.com/tutur3u/platform/commit/79d146ad9b9b7fbd7e9b1cdd2c5cc38cef21d72d))
* **ci:** stabilize main checks ([5fdf019](https://github.com/tutur3u/platform/commit/5fdf019283fd9765075afea82444444429a82916))
* **e2e:** honor forwarded localhost auth origins ([abbbf5f](https://github.com/tutur3u/platform/commit/abbbf5ff224fe2ce50a09483c17731067738c227))

## [0.2.2] - 2025-10-28

### Fixed
- **Critical:** Fixed runtime error "server_1 is not defined" in Next.js middleware
- Changed compilation target from CommonJS to ES modules for Next.js compatibility
- Fixed import statements in proxy.ts to properly compile with ES modules

### Changed
- Package now outputs ES modules (`import/export`) instead of CommonJS (`require`)
- Added `"type": "module"` to package.json
- Updated TypeScript config to use `module: "ESNext"` and `moduleResolution: "Bundler"`

## [0.2.1] - 2025-10-28

### Fixed
- Fixed TypeScript composite build configuration (`tsc --build` instead of `tsc`)
- Configured `tsBuildInfoFile` to store in `dist/` to prevent stale build cache issues
- Fixed "module not found" errors in monorepo by ensuring dist folder is always built
- Simplified clean script since tsbuildinfo is now co-located with dist

### Changed
- Updated build scripts to use `tsc --build` for composite projects
- Added `build:watch` script for development workflow
- Enhanced documentation with troubleshooting for missing dist folder

## [0.2.0] - 2025-10-28

### Changed
- **Breaking:** Changed exports to always point to compiled `dist/` files (both dev and production)
- Removed dual-mode configuration to fix Next.js/Turbopack transpilation issues
- Package now requires build step before use in monorepo

### Added
- Comprehensive setup and troubleshooting documentation
- QUICKSTART.md for new contributors
- PUBLISHING.md with detailed publishing guide
- `.gitignore` for build artifacts
- Watch mode for active development

## [0.1.2] - 2025-10-28

### Added
- Comprehensive TypeScript type definitions
- Enhanced README with detailed usage examples
- Proper npm package configuration for publishing
- Build process using TypeScript compiler
- Package exports for all modules

### Changed
- Moved Next.js and React to peer dependencies
- Updated package.json with proper metadata and exports
- Improved package structure for npm distribution

### Fixed
- TypeScript build configuration
- Module resolution for external consumers

## [0.1.1] - Previous Release

### Added
- Initial release with basic Supabase client utilities
- Server and client-side implementations
- Admin client support
- Realtime utilities
- User management helpers

## [0.1.0] - Initial Release

### Added
- Basic Supabase client wrappers for Next.js
- Cookie-based authentication handling
- TypeScript support

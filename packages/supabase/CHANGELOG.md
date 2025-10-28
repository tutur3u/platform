# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

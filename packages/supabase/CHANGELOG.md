# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1](https://github.com/tutur3u/platform/compare/supabase-v0.6.0...supabase-v0.6.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))

## [0.6.0](https://github.com/tutur3u/platform/compare/supabase-v0.5.2...supabase-v0.6.0) (2026-10-17)


### Features

* **infrastructure:** add durable employee creation journal ([#6286](https://github.com/tutur3u/platform/issues/6286)) ([c3d2fcc](https://github.com/tutur3u/platform/commit/c3d2fcc9fc7e9a358e95185967e44a02f1d1dce6))
* **infrastructure:** prepare unwired employee creation workflow ([#6066](https://github.com/tutur3u/platform/issues/6066)) ([fad12f7](https://github.com/tutur3u/platform/commit/fad12f7f379d4c1f8b890742c967b27aee4fcd5c))
* **lettin:** compose published collections with public links ([17a22a6](https://github.com/tutur3u/platform/commit/17a22a680b0abcb7417a304b607c126beb86823c))
* **lettin:** reconcile authored fact ordering with current editor ([dd51991](https://github.com/tutur3u/platform/commit/dd51991152131baf1431c224fae9bf9465f21280))
* **lettin:** reconcile character fact labels with current editor ([2b43a9e](https://github.com/tutur3u/platform/commit/2b43a9ef3f2c2a46837ea6f5d636af0a5028a175))
* **lettin:** reconcile private note discard review with current main ([8b19f09](https://github.com/tutur3u/platform/commit/8b19f099af02e65bdf522766f32d44146d843349))
* **lettin:** reconcile private publication preview with main ([9a64c17](https://github.com/tutur3u/platform/commit/9a64c1728e4144cc9f97bcaa4bb4ce20a6819c51))
* **lettin:** reconcile private studio artwork filtering with current main ([e01d4ae](https://github.com/tutur3u/platform/commit/e01d4ae0b933ccf4f6f62ad7bd294225003f10ae))
* **lettin:** reconcile private studio membership filters with main ([bab74a5](https://github.com/tutur3u/platform/commit/bab74a54460659e1b0f64bc42dfc5b1bd58aed6b))
* **lettin:** reconcile private Studio ordering with main ([61feb60](https://github.com/tutur3u/platform/commit/61feb600942de9087ca2f43744c3dcf2b6c3ff64))
* **lettin:** reconcile private studio tag filters with current main ([90b136c](https://github.com/tutur3u/platform/commit/90b136cf39d3ae1eed6fc0e7f4362e485e404cfb))
* **lettin:** reconcile published reading sequence with current main ([a872882](https://github.com/tutur3u/platform/commit/a8728827d0c5fcbf7c380ac637b340b483eaea2f))
* **lettin:** reconcile reviewed import browsing with current main ([cd37cc8](https://github.com/tutur3u/platform/commit/cd37cc8c32138874349be82a807fe57ae4f4e91c))
* **lettin:** reconcile scoped notebook export with main ([5971e66](https://github.com/tutur3u/platform/commit/5971e666bedf639872e58de46e4139fa00adf326))
* **mail:** reconcile connected accounts with main ([3e2eae1](https://github.com/tutur3u/platform/commit/3e2eae1e93d8f03bf6425055f51453a1061aaada))
* **platform:** reconcile public link controls with main ([c07411c](https://github.com/tutur3u/platform/commit/c07411cd829b16a0ea65368e35f8683f1d948eaa))
* reconcile local reader preferences with main ([fd3837a](https://github.com/tutur3u/platform/commit/fd3837a80309507e4eaf2029ca922977411e03a3))
* reconcile published reading statistics with main ([81d7aa3](https://github.com/tutur3u/platform/commit/81d7aa3e4efbad63c84952ef78984d27b84ba1d8))
* reconcile saved library filters and ordering with main ([7d470ba](https://github.com/tutur3u/platform/commit/7d470ba36add3db7a8392e791eac56a4e4275d41))
* **supabase:** prepare scoped server Auth construction ([#6069](https://github.com/tutur3u/platform/issues/6069)) ([86e42f0](https://github.com/tutur3u/platform/commit/86e42f0d9ec30e66e9e59e7f2606375f1c24ef91))
* **supabase:** support scoped server Auth construction ([eec9ea8](https://github.com/tutur3u/platform/commit/eec9ea87c3180c9a4b358705b0c8365e74a46a1a))


### Bug Fixes

* **database:** reconcile tutoring absence identity with main ([afd5330](https://github.com/tutur3u/platform/commit/afd53306ed95d7ccc554a1bed3021c16a9a63747))
* **deps:** preserve Auth JS credential serializer contract ([f8696ed](https://github.com/tutur3u/platform/commit/f8696ed991cfa4b6c51bb86d59a93632cb5da2af))
* **feedback:** qualify bounded staff operation lifetimes ([5d338b1](https://github.com/tutur3u/platform/commit/5d338b1d0417df51870e37464581a06f6a57deb0))
* **feedback:** qualify scoped staff auth transport ([1c5e796](https://github.com/tutur3u/platform/commit/1c5e79691e53eeab19279167f506d1e061e3f652))
* **lettin:** bound private writing statistics traversal ([065908f](https://github.com/tutur3u/platform/commit/065908f355303f4da834d79c0fb051dd1bd467f1))
* **lettin:** qualify private notebook import and strip gallery media ([284bc8d](https://github.com/tutur3u/platform/commit/284bc8d57edf1d8f58b908d36fdbf9b3c3ee8d94))
* **lettin:** reconcile optional source references with current main ([bf983c2](https://github.com/tutur3u/platform/commit/bf983c20700dcd97e1ded814ea88f3231ed2ccc2))
* **lettin:** reconcile reviewed private notebook copy with main ([b91bbc8](https://github.com/tutur3u/platform/commit/b91bbc8d580aab48f5f8b74a3575f446939d8fb2))
* **lettin:** retain private progress when restoring published drafts ([ea457e5](https://github.com/tutur3u/platform/commit/ea457e5b514ecaf7cf91e80935307d4083ebe930))
* **parley:** reconcile pinned cache runtime with main ([a21ed6d](https://github.com/tutur3u/platform/commit/a21ed6d81c5b68e7f1727c6b8128ee57b88f588f))
* reconcile external project storage analytics with main ([573f414](https://github.com/tutur3u/platform/commit/573f414522a1e77c657cb7b54a43331d1b06922b))
* **sdk:** reconcile package qualification with main ([0bd74e7](https://github.com/tutur3u/platform/commit/0bd74e7f2a16bd46465e1514eb17269c25e9431d))

## [0.5.2](https://github.com/tutur3u/platform/compare/supabase-v0.5.1...supabase-v0.5.2) (2026-09-20)


### Bug Fixes

* **deps:** align React types and published consumer ranges ([3612cd8](https://github.com/tutur3u/platform/commit/3612cd81723fb5a6982152688227ed21bc4095fd))
* **deps:** preserve React peer compatibility and clarify audit ([777b9ed](https://github.com/tutur3u/platform/commit/777b9ed7f42095bb9361e6bed94d989310c222de))
* **finance:** retain actors across invoice audit writes ([75e1139](https://github.com/tutur3u/platform/commit/75e11390aa30493ee1f83f95660cfaf7547e13c0)) ([#5383](https://github.com/tutur3u/platform/issues/5383)) ([a1fbb54](https://github.com/tutur3u/platform/commit/a1fbb54532f652116064ab7d7b8d11b217b2b9d4))

## [0.5.1](https://github.com/tutur3u/platform/compare/supabase-v0.5.0...supabase-v0.5.1) (2026-08-21)


### Bug Fixes

* **ci:** complete dependency and Rust validation ([61e4c12](https://github.com/tutur3u/platform/commit/61e4c12ec3c90707dde63ed7469854519b3688c8))

## [0.5.0](https://github.com/tutur3u/platform/compare/supabase-v0.4.1...supabase-v0.5.0) (2026-07-25)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))

## [0.4.1](https://github.com/tutur3u/platform/compare/supabase-v0.4.0...supabase-v0.4.1) (2026-07-21)


### Bug Fixes

* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))

## [0.4.0](https://github.com/tutur3u/platform/compare/supabase-v0.3.4...supabase-v0.4.0) (2026-06-24)


### Features

* add supabase request client ([9393266](https://github.com/tutur3u/platform/commit/939326619cada0ed3c05e11933c1b2f7f4f773c1))

## [0.3.4](https://github.com/tutur3u/platform/compare/supabase-v0.3.3...supabase-v0.3.4) (2026-06-17)


### Bug Fixes

* **auth:** clear mirrored Supabase cookies by domain ([292669b](https://github.com/tutur3u/platform/commit/292669bbdd1773ef739d3993d2f93489c5a8e601))
* **ci:** unblock turbopack proxy build, type-safe upstash, format ([42393f8](https://github.com/tutur3u/platform/commit/42393f8519f6695df44f71b8654ba86237296ffe))

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

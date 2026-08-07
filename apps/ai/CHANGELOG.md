# Changelog

## [0.8.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.7.0...ai-studio-v0.8.0) (2026-08-07)


### Features

* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))

## [0.7.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.6.0...ai-studio-v0.7.0) (2026-08-06)


### Features

* **ai:** let external apps authenticate background workloads with a bound API key ([#5091](https://github.com/tutur3u/platform/issues/5091)) ([0626284](https://github.com/tutur3u/platform/commit/062628483edc2e2d1a691a75bfb5ebf3935ca831))
* **ai:** let the studio show provider cost in a chosen currency ([#5097](https://github.com/tutur3u/platform/issues/5097)) ([371ffe6](https://github.com/tutur3u/platform/commit/371ffe6957830772e8f6caf895ac9c8e8576e233))
* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))

## [0.6.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.5.0...ai-studio-v0.6.0) (2026-08-04)


### Features

* **ai:** add production playground and run traces ([ced609b](https://github.com/tutur3u/platform/commit/ced609b655ab44b49f06e19e369f1234a2576687))
* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **ai:** decouple observability from key approval ([c1d96e1](https://github.com/tutur3u/platform/commit/c1d96e10a07094d3166978f4896ca27707f235b3))
* **ai:** deepen studio observability ([c7104c4](https://github.com/tutur3u/platform/commit/c7104c4dc1f7da1926562184d41e238bb74d417b))
* **ai:** enforce external app usage policy ([e229116](https://github.com/tutur3u/platform/commit/e229116990ee03cab2197f41d48134b652252dbe))
* **ai:** rebuild AI Studio information architecture and UI ([c433d70](https://github.com/tutur3u/platform/commit/c433d70b3fce0835cfc0b9d7fbeff228fcc0192d))
* **ai:** show relative activity timestamps ([9ca57f1](https://github.com/tutur3u/platform/commit/9ca57f1a6a1eeca78ac4da9382d4373004331e1f))
* **ai:** support keyless external TTS ([8ebfeae](https://github.com/tutur3u/platform/commit/8ebfeaede3fe3dfa212cc9057d26d3027d7453bb))
* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))
* **meet:** revamp collaborative scheduling ([9124a5d](https://github.com/tutur3u/platform/commit/9124a5d559e071c7e6c1c713cfbca4d9f5205611))
* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))


### Bug Fixes

* **ai:** accept rich embedding payloads ([a65b13f](https://github.com/tutur3u/platform/commit/a65b13fa80034959e5f18ee4515b3081002558e2))
* **ai:** diagnose production settlement failures ([60411c3](https://github.com/tutur3u/platform/commit/60411c30ee4c3aab213f90b0ecddcf33ffcbfb51))
* **ai:** improve playground credentials and diagnostics ([b61db3c](https://github.com/tutur3u/platform/commit/b61db3c0dc2cb3b5bd20c3ec3b390795b9fa0f9d))
* **ai:** include workspace credit usage ([854b1e7](https://github.com/tutur3u/platform/commit/854b1e74fc30b3ea0c3e657932d04fd48926d523))
* **ai:** keep version badge inside intl provider ([ace9003](https://github.com/tutur3u/platform/commit/ace9003913e208ff98c9f71f97c9fe624cc6f1d1))
* **ai:** prefer direct Google gateway routing ([06b6ef7](https://github.com/tutur3u/platform/commit/06b6ef765ed2409f915dbe4366df0337c5fd8742))
* **ai:** preserve usage during schema rollout ([3a24ef1](https://github.com/tutur3u/platform/commit/3a24ef1170e6b94a2627abcb5f1b9b4acd3a3b7a))
* **ai:** prevent satellite auth loops ([80f264c](https://github.com/tutur3u/platform/commit/80f264cc91e1709a96148f203ab12bca8a8e392b))
* **ai:** reconcile expired Studio reservations ([aeeadd4](https://github.com/tutur3u/platform/commit/aeeadd4bbbb6f14b5598f298a9d0c801bdf8ea53))
* **ai:** refresh live observability ranges ([819303b](https://github.com/tutur3u/platform/commit/819303b41f4bd28c879a41a0ed6dead7fb841532))
* **ai:** repair studio settings administration ([ec4c5e9](https://github.com/tutur3u/platform/commit/ec4c5e9f18099bedf7b0e1e876bf215e4dc29fd0))
* **ai:** restore members and paginate studio lists ([9d83554](https://github.com/tutur3u/platform/commit/9d835547877fe8c60ec7fcb7581bd2fc545d49ef))
* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))
* **ai:** route Gemini embeddings through Google ([3d94e5c](https://github.com/tutur3u/platform/commit/3d94e5c80240b3866f9fc755b5d0589f2b5f19b8))
* **ai:** suspend locale app shell ([14c64a2](https://github.com/tutur3u/platform/commit/14c64a22d6a53fba31904c68bd79d98d2fa9ad64))
* **ai:** use direct Google provider ([3039a95](https://github.com/tutur3u/platform/commit/3039a95097692c6b869d7c9ca6a9712e6b493f5b))
* **workspaces:** route satellite creation through setup ([754bf1b](https://github.com/tutur3u/platform/commit/754bf1b81360e4755a171819f3a8e6a7c102f351))

## [0.5.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.4.0...ai-studio-v0.5.0) (2026-07-29)


### Features

* **ai:** decouple observability from key approval ([c1d96e1](https://github.com/tutur3u/platform/commit/c1d96e10a07094d3166978f4896ca27707f235b3))
* **ai:** support keyless external TTS ([8ebfeae](https://github.com/tutur3u/platform/commit/8ebfeaede3fe3dfa212cc9057d26d3027d7453bb))

## [0.4.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.3.0...ai-studio-v0.4.0) (2026-07-28)


### Features

* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))


### Bug Fixes

* **ai:** repair studio settings administration ([ec4c5e9](https://github.com/tutur3u/platform/commit/ec4c5e9f18099bedf7b0e1e876bf215e4dc29fd0))
* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))

## [0.3.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.2.0...ai-studio-v0.3.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **ai:** enforce external app usage policy ([e229116](https://github.com/tutur3u/platform/commit/e229116990ee03cab2197f41d48134b652252dbe))


### Bug Fixes

* **ai:** keep version badge inside intl provider ([ace9003](https://github.com/tutur3u/platform/commit/ace9003913e208ff98c9f71f97c9fe624cc6f1d1))
* **ai:** prevent satellite auth loops ([80f264c](https://github.com/tutur3u/platform/commit/80f264cc91e1709a96148f203ab12bca8a8e392b))
* **ai:** suspend locale app shell ([14c64a2](https://github.com/tutur3u/platform/commit/14c64a22d6a53fba31904c68bd79d98d2fa9ad64))

## [0.2.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.1.0...ai-studio-v0.2.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))


### Bug Fixes

* **ai:** suspend locale app shell ([14c64a2](https://github.com/tutur3u/platform/commit/14c64a22d6a53fba31904c68bd79d98d2fa9ad64))

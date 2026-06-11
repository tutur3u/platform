# Changelog

## [0.5.0](https://github.com/tutur3u/platform/compare/ui-v0.4.1...ui-v0.5.0) (2026-06-11)


### Features

* **finance:** add wallet checkpoints ([54f9f29](https://github.com/tutur3u/platform/commit/54f9f29446ff9991e09a68abb258ce66c640b086))
* **tasks:** add compact task create popover ([6c4b957](https://github.com/tutur3u/platform/commit/6c4b957634136a57e3ceb4ba1fc2f151c8a04314))
* **tasks:** add task sound effects ([7c4cb06](https://github.com/tutur3u/platform/commit/7c4cb06f8f134db201f54294c3c2641ae9ae5d07))


### Bug Fixes

* **finance:** merge transfer rows and sync wallet icons ([084e1ac](https://github.com/tutur3u/platform/commit/084e1ac662a3f41c59cfc54d58fa5897293697d2))

## [0.4.1](https://github.com/tutur3u/platform/compare/ui-v0.4.0...ui-v0.4.1) (2026-06-11)


### Bug Fixes

* **chat:** throttle Zalo phone sync and group mirrored chats ([51f3ab5](https://github.com/tutur3u/platform/commit/51f3ab5cec4a7a0c7403100045a6d7500975caf3))

## [0.4.0](https://github.com/tutur3u/platform/compare/ui-v0.3.2...ui-v0.4.0) (2026-06-10)


### Features

* **chat:** add personal channels and root integrations ([fb5e753](https://github.com/tutur3u/platform/commit/fb5e7534588c7015449313fc4a752b70732f227e))
* **chat:** merge personal channels and root integrations ([22d50ce](https://github.com/tutur3u/platform/commit/22d50ce0d75e36e0beaa973ef59cbd296e22dc35))

## [0.3.2](https://github.com/tutur3u/platform/compare/ui-v0.3.1...ui-v0.3.2) (2026-06-10)


### Bug Fixes

* **web:** harden task search and command launcher ([e4f8fd2](https://github.com/tutur3u/platform/commit/e4f8fd28bd78eabb0aa38182af2a32b85b5bf3e0))

## [0.3.1](https://github.com/tutur3u/platform/compare/ui-v0.3.0...ui-v0.3.1) (2026-06-09)


### Bug Fixes

* **finance:** reduce invoice create read fanout ([69ae9e9](https://github.com/tutur3u/platform/commit/69ae9e904ce6c6d06085e05ffa17ec59a80ee451))

## [0.3.0](https://github.com/tutur3u/platform/compare/ui-v0.2.0...ui-v0.3.0) (2026-06-08)


### Features

* **calendar:** unify provider sync and connections UX ([5db53aa](https://github.com/tutur3u/platform/commit/5db53aa5d5d0ce915c2357cecc89e13b0c2af614))
* **platform:** add calendar sources and personal Zalo agents ([2746e72](https://github.com/tutur3u/platform/commit/2746e7297a43def06c3c2f12b7751dea94074113))
* **settings:** add fullscreen settings sheet ([809c78e](https://github.com/tutur3u/platform/commit/809c78e6a38ce1623249540e846c63d26cd8d3b9))
* **tasks:** show duration and quick scheduling menu ([9443183](https://github.com/tutur3u/platform/commit/944318327515269a5dce8b1c1ececb28823b0767))
* **web:** add UI component showcase ([8fcbc6b](https://github.com/tutur3u/platform/commit/8fcbc6b4b64c3f9e9da5eb2ddd6d504a83dd2ec4))
* **web:** merge UI component showcase ([5f4e840](https://github.com/tutur3u/platform/commit/5f4e840960a114952d728b88caf914d2e05959b3))


### Bug Fixes

* **auth:** preserve satellite Supabase sessions ([a8b49bb](https://github.com/tutur3u/platform/commit/a8b49bb2d29f42b4a0267aadd5d2e2fd1074aeab))
* **auth:** support supabase-first satellite sessions ([b014fcf](https://github.com/tutur3u/platform/commit/b014fcf6db8218a1b54fd79f5e13629f66cad090))
* **ci:** harden workflow guardrails ([2e646c2](https://github.com/tutur3u/platform/commit/2e646c29079380ef49b238f39305058174c4e9f1))
* **ci:** stabilize current test workflows ([43f6022](https://github.com/tutur3u/platform/commit/43f60220645246ea4a423b0417169203e9345b2f))
* **finance:** restore subscription checkout flow ([1e4cf62](https://github.com/tutur3u/platform/commit/1e4cf62e4c80f15e5c25feeb2b4ff3ab659edd72))
* **finance:** restore subscription invoice auto-products ([515f449](https://github.com/tutur3u/platform/commit/515f4499f8eb057e3dd4fb43a85186a31cbac106))
* **tasks:** hydrate task scheduling settings ([e5d0a1f](https://github.com/tutur3u/platform/commit/e5d0a1f70e8ae7686b3f6dc169374029e2af5a68))
* **tasks:** improve kanban bulk actions ([b7c313c](https://github.com/tutur3u/platform/commit/b7c313c30d29b9cd090de396c29979676bdb9d95))
* **tasks:** polish kanban bulk selection ([3a29ce7](https://github.com/tutur3u/platform/commit/3a29ce7ea73c2bdf79e8a9908c0e70299caa3053))
* **tasks:** reconcile review dates and drag state ([176dcd3](https://github.com/tutur3u/platform/commit/176dcd305d8292e5cf1a2178bfe759b1074bcb54))
* **tasks:** reduce task board rate limit churn ([de0931f](https://github.com/tutur3u/platform/commit/de0931fe7c1865cbf5c396551b7469fc6bd25e5b))
* **tasks:** refresh selected cards for bulk actions ([fe0532c](https://github.com/tutur3u/platform/commit/fe0532cada53449e0042eaa59eb4de6b80b04bf3))
* **tasks:** route bulk actions to source workspaces ([3f4a024](https://github.com/tutur3u/platform/commit/3f4a0248c67eb8b9db16ea00c85d1865ded491c1))
* **tasks:** save scheduling settings through user route ([c282def](https://github.com/tutur3u/platform/commit/c282def601c1fc28ccc48f2d60a9313094dd6acc))
* **ui:** defer responsive chart rendering ([6fd38e9](https://github.com/tutur3u/platform/commit/6fd38e93e9d4d9ed0258c59abd5cf2e992ec8bf9))
* **ui:** export shared button and sonner entries ([ede3e9c](https://github.com/tutur3u/platform/commit/ede3e9c4e2a6bf902478124c9a977412fa2ed9ca))
* **ui:** preserve Supabase avatar urls ([a8550bb](https://github.com/tutur3u/platform/commit/a8550bb3351b6b04a54e619bfa29653797d5c38b))
* **ui:** remove stale sidebar import suppression ([65a9383](https://github.com/tutur3u/platform/commit/65a938320415bf1ce13620eb95b35db959eacc6c))
* **users:** restore referral search updates ([1703c46](https://github.com/tutur3u/platform/commit/1703c4603f95bfb266dac2f121825c056781d8fa))
* **web:** stabilize local login development ([37f660e](https://github.com/tutur3u/platform/commit/37f660e0d2d1fe3a9f02e38a96f04272e87355df))
* **web:** use local footer logo in dev ([f45ed5c](https://github.com/tutur3u/platform/commit/f45ed5cef2278f85d35bbcd2af76555e53b3a616))
* **web:** use local workspace logo fallback ([d32bee7](https://github.com/tutur3u/platform/commit/d32bee79537bdf69e17c0734a55d40591ae15fe9))


### Performance Improvements

* **tasks:** filter task boards through server RPCs ([657f445](https://github.com/tutur3u/platform/commit/657f4458cd40c2e31774c7d9ef0628f986af1838))
* **ui:** defer sidebar preference sync ([c476b81](https://github.com/tutur3u/platform/commit/c476b818bc5b5c08067317884c530c87b46ac7e9))
* **web:** improve local dev compile speed ([b9df46e](https://github.com/tutur3u/platform/commit/b9df46e9cbd8f3189d074229dc0f26da2670e8ed))
* **web:** trim dashboard workspace compile graph ([9b7296d](https://github.com/tutur3u/platform/commit/9b7296d648f9e0239d2640d6bd67207c2e01ac06))

## [0.2.0](https://github.com/tutur3u/platform/compare/ui-v0.1.0...ui-v0.2.0) (2026-06-03)


### Features

* **chat:** add generated titles and personal sections ([10234b4](https://github.com/tutur3u/platform/commit/10234b4b8d48eb44828b89f86b7fcf59d587432e))


### Bug Fixes

* **chat:** restore title generation and pagination ([f85df59](https://github.com/tutur3u/platform/commit/f85df59fba274c694fd38a991607e8d263ae1af3))
* **chat:** support ai-agent title and gateway verification ([296cd07](https://github.com/tutur3u/platform/commit/296cd0727b56b8b2440e6877932c74fcad07e800))
* **meet:** protect workspace plan detail pages ([2574e45](https://github.com/tutur3u/platform/commit/2574e45d5a44db3425438233794bd620abfec778))
* **release:** repair package publishing metadata ([88d9a6d](https://github.com/tutur3u/platform/commit/88d9a6dcc3556b1d1aa677c0592a1e1901a389e3))
* **ui:** bind stale task mentions to route workspace ([344773f](https://github.com/tutur3u/platform/commit/344773f7b3b04634a11423c8c31c95fefa0ec437))
* **ui:** refetch task dialog broadcast updates ([d7259b6](https://github.com/tutur3u/platform/commit/d7259b61daa33cb933df0c68222f43352e31b743))
* **ui:** scope task mention resolution cache ([ef60769](https://github.com/tutur3u/platform/commit/ef607698f220a8e798ef797ffc90690b1711b3bd))

## [0.1.0](https://github.com/tutur3u/platform/compare/ui-v0.0.4...ui-v0.1.0) (2026-06-02)


### Features

* **chat:** add ai agent operations controls ([2429279](https://github.com/tutur3u/platform/commit/2429279777e74014abb80699a7359038eb751460))

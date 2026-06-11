# Changelog

## [0.4.1](https://github.com/tutur3u/platform/compare/internal-api-v0.4.0...internal-api-v0.4.1) (2026-06-11)


### Bug Fixes

* **ci:** isolate production promotion prebuilds ([d044288](https://github.com/tutur3u/platform/commit/d044288fdba58e4d1535b6eb41b992ec412a69de))

## [0.4.0](https://github.com/tutur3u/platform/compare/internal-api-v0.3.0...internal-api-v0.4.0) (2026-06-10)


### Features

* **chat:** add personal channels and root integrations ([fb5e753](https://github.com/tutur3u/platform/commit/fb5e7534588c7015449313fc4a752b70732f227e))
* **chat:** merge personal channels and root integrations ([22d50ce](https://github.com/tutur3u/platform/commit/22d50ce0d75e36e0beaa973ef59cbd296e22dc35))
* **infrastructure:** automate production promotion ([6b6a368](https://github.com/tutur3u/platform/commit/6b6a3685615c9aca9d957564cae46e9ea81e44a0))
* **inventory:** add storefront checkout app ([8a9f9b4](https://github.com/tutur3u/platform/commit/8a9f9b4bbe576af34a4db0956308b5b51fa1f099))
* **mobile:** add deployment vault CI flow ([b1d21eb](https://github.com/tutur3u/platform/commit/b1d21eb1e30d74b412e4687b095004c21cf03dd1))
* **web:** store multi-account sessions server-side ([2359f35](https://github.com/tutur3u/platform/commit/2359f35a849488f5b6c4070b87dbff8de2d8c9c4))


### Bug Fixes

* **chat:** harden production auth handoff ([8d2ba61](https://github.com/tutur3u/platform/commit/8d2ba61d817bb98f8b4b5880ea8ac802006e4a51))
* **web:** isolate login otp settings ([f8299aa](https://github.com/tutur3u/platform/commit/f8299aa5e8156910229a77540fb166eeb4a9d538))

## [0.3.0](https://github.com/tutur3u/platform/compare/internal-api-v0.2.1...internal-api-v0.3.0) (2026-06-10)


### Features

* **cli:** add host switching and finance transfers ([6c732c1](https://github.com/tutur3u/platform/commit/6c732c13fae9173e97cadb0b4534f37d42908a92))


### Bug Fixes

* **ci:** auto-recover package release dependencies ([40b2539](https://github.com/tutur3u/platform/commit/40b25390c903194a3c85cc627c737a4acd0d6fa9))
* **web:** harden task search and command launcher ([e4f8fd2](https://github.com/tutur3u/platform/commit/e4f8fd28bd78eabb0aa38182af2a32b85b5bf3e0))

## [0.2.1](https://github.com/tutur3u/platform/compare/internal-api-v0.2.0...internal-api-v0.2.1) (2026-06-09)


### Bug Fixes

* **ci:** recover releases and package tsgo builds ([d82b846](https://github.com/tutur3u/platform/commit/d82b846c6232d9fb72b7d2aa808020bc24292a19))

## [0.2.0](https://github.com/tutur3u/platform/compare/internal-api-v0.1.0...internal-api-v0.2.0) (2026-06-08)


### Features

* **auth:** share Supabase cookies across apps ([f72ec8e](https://github.com/tutur3u/platform/commit/f72ec8e7a35f13a301b95b2aa916aefbc5848e6e))
* **infrastructure:** add stress test observability ([41d8ab3](https://github.com/tutur3u/platform/commit/41d8ab3b0306c96569f0428d6efbc78ccecf9d1a))
* **platform:** add calendar sources and personal Zalo agents ([2746e72](https://github.com/tutur3u/platform/commit/2746e7297a43def06c3c2f12b7751dea94074113))
* **tasks:** show duration and quick scheduling menu ([9443183](https://github.com/tutur3u/platform/commit/944318327515269a5dce8b1c1ececb28823b0767))


### Bug Fixes

* **auth:** split shared-ip login rate limits ([1cbbd2f](https://github.com/tutur3u/platform/commit/1cbbd2f1f37512204640b4d309395786243f05de))
* **ci:** align package provenance metadata ([0f7ef88](https://github.com/tutur3u/platform/commit/0f7ef8834c0054b020c3eaa1042bfcf10145ab1a))
* **ci:** stabilize package release workflows ([d6243c2](https://github.com/tutur3u/platform/commit/d6243c2d7ee7ae599d9f17fba4be9f9cc71a1722))
* **tasks:** save scheduling settings through user route ([c282def](https://github.com/tutur3u/platform/commit/c282def601c1fc28ccc48f2d60a9313094dd6acc))
* **users:** restore referral search updates ([1703c46](https://github.com/tutur3u/platform/commit/1703c4603f95bfb266dac2f121825c056781d8fa))
* **web:** route login through auth APIs ([221e83c](https://github.com/tutur3u/platform/commit/221e83cbb14302c6fae4d0548b5023887a19c3e5))


### Performance Improvements

* **tasks:** filter task boards through server RPCs ([657f445](https://github.com/tutur3u/platform/commit/657f4458cd40c2e31774c7d9ef0628f986af1838))
* **web:** narrow workspace shell compile graph ([7544319](https://github.com/tutur3u/platform/commit/754431996d594961f4d279be522e043fe5ff3d62))

## [0.1.0](https://github.com/tutur3u/platform/compare/internal-api-v0.0.2...internal-api-v0.1.0) (2026-06-03)


### Features

* **chat:** add generated titles and personal sections ([10234b4](https://github.com/tutur3u/platform/commit/10234b4b8d48eb44828b89f86b7fcf59d587432e))


### Bug Fixes

* **chat:** support ai-agent title and gateway verification ([296cd07](https://github.com/tutur3u/platform/commit/296cd0727b56b8b2440e6877932c74fcad07e800))
* **infrastructure:** bind observability cursors before caps ([62d0826](https://github.com/tutur3u/platform/commit/62d0826a1ae8dc75921563fde332303d27c5e6a5))
* **storage:** mediate external project asset uploads ([e653210](https://github.com/tutur3u/platform/commit/e6532109fc20d54f2df1c11cd2412af6ca1dc185))
* **storage:** mediate group storage uploads ([df4a52d](https://github.com/tutur3u/platform/commit/df4a52ddbde12c72563aa771592268a5640d6bf9))
* **web:** enforce learner course assignments ([1d4795c](https://github.com/tutur3u/platform/commit/1d4795c1ce696613fc1b8df222c013767ba0ad6b))

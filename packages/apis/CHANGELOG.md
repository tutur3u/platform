# Changelog

## [0.5.0](https://github.com/tutur3u/platform/compare/apis-v0.4.2...apis-v0.5.0) (2026-06-17)


### Features

* **tasks:** add per-board default list for new tasks ([2d1d308](https://github.com/tutur3u/platform/commit/2d1d3082422bdd4813accb258fee79b322ce647b))


### Bug Fixes

* **finance:** enforce checkpoint viewing windows ([9c444a3](https://github.com/tutur3u/platform/commit/9c444a30b058281d2e15387a0f8761f5c0d59e96))
* **finance:** enforce transfer wallet create permissions ([ee28269](https://github.com/tutur3u/platform/commit/ee2826901055c9bf94cf504e28f9dfb0d27ab60a))
* **finance:** require confidential transfer permission ([cddf64f](https://github.com/tutur3u/platform/commit/cddf64fedcbf0bbbea45a147ec77fb855eacc18a))
* **finance:** validate transaction tag workspace ([32e3ec0](https://github.com/tutur3u/platform/commit/32e3ec020f8cfe71b9e9e9a5051594d50f8e5573))
* **tasks:** bound description chunk writes ([1060db8](https://github.com/tutur3u/platform/commit/1060db81f2451de5877281252f85946c25ce125e))
* **tasks:** clean calendar data on bulk delete ([c44967e](https://github.com/tutur3u/platform/commit/c44967e36fd1651f9384a5743866e4cb129fb117))
* **tasks:** exclude deleted boards from search ([e502e08](https://github.com/tutur3u/platform/commit/e502e088f0a977ef54c29a95f7572bca627f5fa1))
* **tasks:** hydrate task workspace metadata from server ([ebbcecb](https://github.com/tutur3u/platform/commit/ebbcecbd88e3215c6f91d7fc0719ce5bb6f23eee))
* **tasks:** make default_list_id board reads rollout-safe ([dbd7ca1](https://github.com/tutur3u/platform/commit/dbd7ca10eab77488b05cf2e8efecc3697eb758ff))
* **tasks:** persist description yjs state separately ([07a5e80](https://github.com/tutur3u/platform/commit/07a5e80b96ea509c24ba0570ef22f5300fc36040))
* **tasks:** recover exhausted create sort keys ([14fb9be](https://github.com/tutur3u/platform/commit/14fb9be9e3c64dd8498b4f4ef28aa1baa7a48c92))
* **tasks:** report default list save failures ([9c2e5ef](https://github.com/tutur3u/platform/commit/9c2e5ef8e84d6fe10f87ba1faea0ec49cc379cf9))
* **tasks:** secure realtime task channels ([6d98d16](https://github.com/tutur3u/platform/commit/6d98d16baa9ecf68bdd47ce3ce6dc1ff2e2bca84))
* **tasks:** secure realtime task channels ([03dc6d6](https://github.com/tutur3u/platform/commit/03dc6d66666d1d3ae422f91cb94285367a8c1071))

## [0.4.2](https://github.com/tutur3u/platform/compare/apis-v0.4.1...apis-v0.4.2) (2026-06-15)


### Bug Fixes

* **tasks:** persist large task descriptions in chunks ([457744a](https://github.com/tutur3u/platform/commit/457744aa051d06baccc5df5aa4d4cb509534ea8b))

## [0.4.1](https://github.com/tutur3u/platform/compare/apis-v0.4.0...apis-v0.4.1) (2026-06-13)


### Bug Fixes

* **ci:** make platform package gate non-blocking ([895cee0](https://github.com/tutur3u/platform/commit/895cee009fac0e5464fdb4f9c5c4c9ef0481c854))

## [0.4.0](https://github.com/tutur3u/platform/compare/apis-v0.3.0...apis-v0.4.0) (2026-06-13)


### Features

* **finance:** add infinite wallet loading ([76eba7a](https://github.com/tutur3u/platform/commit/76eba7a849c3a6b948e231a1e83e1e2faa10bb16))
* **finance:** add wallet checkpoint audit history ([11139c7](https://github.com/tutur3u/platform/commit/11139c7e354a8f29e83187748711f6ae39c48e70))
* **finance:** improve credit wallet support ([3a737fe](https://github.com/tutur3u/platform/commit/3a737fe1f1daf2294ca79a8f0f08f85c69697057))


### Bug Fixes

* **finance:** tolerate pending checkpoint storage ([f6205a9](https://github.com/tutur3u/platform/commit/f6205a9647d21ed37eb2fa779c7edec6d3316a35))
* **tasks:** sync task realtime with broadcasts ([8c56154](https://github.com/tutur3u/platform/commit/8c56154e517797dcac0ec0971d8a474b50292706))
* **ui:** make package graph installable ([f3eb0ff](https://github.com/tutur3u/platform/commit/f3eb0ff3cbed2e43fd77dfb8164e60c5d195a36b))

## [0.3.0](https://github.com/tutur3u/platform/compare/apis-v0.2.0...apis-v0.3.0) (2026-06-11)


### Features

* **finance:** add wallet checkpoints ([54f9f29](https://github.com/tutur3u/platform/commit/54f9f29446ff9991e09a68abb258ce66c640b086))

## [0.2.0](https://github.com/tutur3u/platform/compare/apis-v0.1.0...apis-v0.2.0) (2026-06-11)


### Features

* **finance:** add CLI tag CRUD ([bc60f8e](https://github.com/tutur3u/platform/commit/bc60f8eb1af2fe650a28ef44ec33466a4ce831de))


### Bug Fixes

* **web:** allow cli finance transfer auth ([b3f08cb](https://github.com/tutur3u/platform/commit/b3f08cbb6d9981f4a4a15c428aa41e5d2869038d))

## [0.1.0](https://github.com/tutur3u/platform/compare/apis-v0.0.12...apis-v0.1.0) (2026-06-10)


### Features

* **cli:** add host switching and finance transfers ([6c732c1](https://github.com/tutur3u/platform/commit/6c732c13fae9173e97cadb0b4534f37d42908a92))

## [0.0.12](https://github.com/tutur3u/platform/compare/apis-v0.0.11...apis-v0.0.12) (2026-06-08)


### Bug Fixes

* **tasks:** avoid RPC for simple board search ([7a2aeea](https://github.com/tutur3u/platform/commit/7a2aeeae77852cb7b8d5bec7ef0775a67cfe3e71))
* **tasks:** hydrate task scheduling settings ([e5d0a1f](https://github.com/tutur3u/platform/commit/e5d0a1f70e8ae7686b3f6dc169374029e2af5a68))


### Performance Improvements

* **tasks:** filter task boards through server RPCs ([657f445](https://github.com/tutur3u/platform/commit/657f4458cd40c2e31774c7d9ef0628f986af1838))
* **web:** split yjs-heavy server compile graph ([8420fd4](https://github.com/tutur3u/platform/commit/8420fd443bf63c9809283087a71302616ba0aed5))

## [0.0.11](https://github.com/tutur3u/platform/compare/apis-v0.0.10...apis-v0.0.11) (2026-06-03)


### Bug Fixes

* **database:** redact tag stats confidential amounts ([4823c36](https://github.com/tutur3u/platform/commit/4823c3653244bf8f9d960dc7182e8ab45827986a))
* **finance:** bind invoice customers to workspace ([c5eafc6](https://github.com/tutur3u/platform/commit/c5eafc6bd26d4a097451b83b1504438561223740))
* **tasks:** enforce member access for external defaults ([87eba13](https://github.com/tutur3u/platform/commit/87eba13deeb9d65f0ee89658fcbe6adfd511d20c))
* **tasks:** require member source workspace access ([194d0ef](https://github.com/tutur3u/platform/commit/194d0efcfc3d859cb63f708181de42ddaa4a8f33))
* **tasks:** validate task description yjs content ([0615184](https://github.com/tutur3u/platform/commit/06151845b24fb7f9cb9526eb8dd8ce1784961a33))

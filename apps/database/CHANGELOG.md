# Changelog

## [1.4.1](https://github.com/tutur3u/platform/compare/database-v1.4.0...database-v1.4.1) (2026-06-11)


### Bug Fixes

* **finance:** allow app-session transaction enrichment ([15feedd](https://github.com/tutur3u/platform/commit/15feedd3ac03810998e78ef60e91735ac44ca16c))
* **storefront:** load public inventory through private rpcs ([80d1149](https://github.com/tutur3u/platform/commit/80d11493e546a594021345f95e3f8e8b22b65e13))

## [1.4.0](https://github.com/tutur3u/platform/compare/database-v1.3.0...database-v1.4.0) (2026-06-10)


### Features

* **inventory:** add storefront checkout app ([8a9f9b4](https://github.com/tutur3u/platform/commit/8a9f9b4bbe576af34a4db0956308b5b51fa1f099))
* **mobile:** add deployment vault CI flow ([b1d21eb](https://github.com/tutur3u/platform/commit/b1d21eb1e30d74b412e4687b095004c21cf03dd1))
* **web:** store multi-account sessions server-side ([2359f35](https://github.com/tutur3u/platform/commit/2359f35a849488f5b6c4070b87dbff8de2d8c9c4))

## [1.3.0](https://github.com/tutur3u/platform/compare/database-v1.2.1...database-v1.3.0) (2026-06-10)


### Features

* **cli:** add host switching and finance transfers ([6c732c1](https://github.com/tutur3u/platform/commit/6c732c13fae9173e97cadb0b4534f37d42908a92))

## [1.2.1](https://github.com/tutur3u/platform/compare/database-v1.2.0...database-v1.2.1) (2026-06-09)


### Bug Fixes

* **ci:** restore local supabase e2e port ([f91a4fe](https://github.com/tutur3u/platform/commit/f91a4fed2143a5a4ee8f616ad70bbaf1fa8f2157))
* **tooling:** address review feedback ([dd26db4](https://github.com/tutur3u/platform/commit/dd26db488cd06434a7d192d58ca9ea488d1040ba))

## [1.2.0](https://github.com/tutur3u/platform/compare/database-v1.1.0...database-v1.2.0) (2026-06-08)


### Features

* **devbox:** execute claimed runner jobs ([2d99e6c](https://github.com/tutur3u/platform/commit/2d99e6cb6b275f7ddf423a021cb1cfcb1d944235))
* **infrastructure:** add stress test observability ([41d8ab3](https://github.com/tutur3u/platform/commit/41d8ab3b0306c96569f0428d6efbc78ccecf9d1a))
* **platform:** add calendar sources and personal Zalo agents ([2746e72](https://github.com/tutur3u/platform/commit/2746e7297a43def06c3c2f12b7751dea94074113))


### Bug Fixes

* **finance:** restore subscription checkout flow ([1e4cf62](https://github.com/tutur3u/platform/commit/1e4cf62e4c80f15e5c25feeb2b4ff3ab659edd72))
* **finance:** restore subscription invoice auto-products ([515f449](https://github.com/tutur3u/platform/commit/515f4499f8eb057e3dd4fb43a85186a31cbac106))


### Performance Improvements

* **tasks:** filter task boards through server RPCs ([657f445](https://github.com/tutur3u/platform/commit/657f4458cd40c2e31774c7d9ef0628f986af1838))

## [1.1.0](https://github.com/tutur3u/platform/compare/database-v1.0.0...database-v1.1.0) (2026-06-03)


### Features

* **devbox:** add remote devbox foundation ([88f81d2](https://github.com/tutur3u/platform/commit/88f81d2a369ba80a3ee601122ca10d9031b63b87))


### Bug Fixes

* **cron:** protect announcement queue sends ([5a608df](https://github.com/tutur3u/platform/commit/5a608dfb0df463a88c5597b5577d7f15d8b34f52))
* **database:** bind mind patches to board workspaces ([e57c8c3](https://github.com/tutur3u/platform/commit/e57c8c341eba421db9825c316cc9acc5c0159bec))
* **database:** bind tulearn learner state to members ([70fce8d](https://github.com/tutur3u/platform/commit/70fce8d3d93063cf1b9f6010035ced89648a9949))
* **database:** guard pending invoice rpcs ([0573c04](https://github.com/tutur3u/platform/commit/0573c04c7c643fc91828f42d24bbf65382d22764))
* **database:** guard personal task placement rpc ([307b6a8](https://github.com/tutur3u/platform/commit/307b6a84807288d0a5b9740f7e974330d5cf43a3))
* **database:** harden abuse trust overrides ([34fa1a3](https://github.com/tutur3u/platform/commit/34fa1a3d0086e43000b77667aceae4bd65876819))
* **database:** redact tag stats confidential amounts ([4823c36](https://github.com/tutur3u/platform/commit/4823c3653244bf8f9d960dc7182e8ab45827986a))
* **e2e:** restore native suite and ci checks ([e178873](https://github.com/tutur3u/platform/commit/e178873854ab6e5a834e09e1f54b773748cd933a))
* **finance:** bind invoice customers to workspace ([c5eafc6](https://github.com/tutur3u/platform/commit/c5eafc6bd26d4a097451b83b1504438561223740))
* **finance:** hide confidential signs in type filters ([a6cbd33](https://github.com/tutur3u/platform/commit/a6cbd33425856639daaaab46e85c98d096904f12))
* **tasks:** aggregate board list task counts ([4774993](https://github.com/tutur3u/platform/commit/477499316126bfa6ba1a9a0603514a718e2c35f1))
* **tasks:** require member source workspace access ([194d0ef](https://github.com/tutur3u/platform/commit/194d0efcfc3d859cb63f708181de42ddaa4a8f33))
* **users:** bind attendance exports to workspace ([6960bdf](https://github.com/tutur3u/platform/commit/6960bdfe6e1db154dd5921a758aa79fa6fa3f978))

# Changelog

## [0.5.1](https://github.com/tutur3u/platform/compare/utils-v0.5.0...utils-v0.5.1) (2026-06-11)


### Bug Fixes

* **finance:** raise read proxy limits ([396ce3e](https://github.com/tutur3u/platform/commit/396ce3ec10b5adf15d021e7aa4f58b057d74da5a))

## [0.5.0](https://github.com/tutur3u/platform/compare/utils-v0.4.0...utils-v0.5.0) (2026-06-10)


### Features

* **devbox:** add runner service repair command ([c4ea7a1](https://github.com/tutur3u/platform/commit/c4ea7a13d5d9f3b07f98cb7de3c5612f599690fb))
* **inventory:** add storefront checkout app ([8a9f9b4](https://github.com/tutur3u/platform/commit/8a9f9b4bbe576af34a4db0956308b5b51fa1f099))


### Bug Fixes

* **chat:** harden production auth handoff ([8d2ba61](https://github.com/tutur3u/platform/commit/8d2ba61d817bb98f8b4b5880ea8ac802006e4a51))
* **devbox:** export runner token in service wrapper ([c0f0cb9](https://github.com/tutur3u/platform/commit/c0f0cb9184eaacef1e37ab540d330d6f7b4f6c62))
* **web:** expose finance transfer migration route ([2aa8732](https://github.com/tutur3u/platform/commit/2aa8732b0ca1018c10f36bd81a63fa05da1b6971))

## [0.4.0](https://github.com/tutur3u/platform/compare/utils-v0.3.1...utils-v0.4.0) (2026-06-10)


### Features

* **cli:** add host switching and finance transfers ([6c732c1](https://github.com/tutur3u/platform/commit/6c732c13fae9173e97cadb0b4534f37d42908a92))
* **devbox:** add infrastructure control panel ([5bfbbd0](https://github.com/tutur3u/platform/commit/5bfbbd025c8482d5ef8218d35599a9d223b5b214))
* **devbox:** add runner setup and tunnel workflows ([27c55d5](https://github.com/tutur3u/platform/commit/27c55d55899c89a7584ab7c3249c9d9a61b6a0b9))
* **devbox:** add runner shutdown and observability ([ebcae14](https://github.com/tutur3u/platform/commit/ebcae148dd4109e6a2f18f089de730dcd8d4f30e))
* **external-projects:** add scoped storage CRUD ([3294ff8](https://github.com/tutur3u/platform/commit/3294ff818e6a2dafbdeec88ed4e4207edc2e5f8c))


### Bug Fixes

* **devbox:** keep setup prompt tests deterministic in ci ([d65cbf4](https://github.com/tutur3u/platform/commit/d65cbf48fe3d99e617ba165f7f25d1e3085e2733))
* **mobile:** pin connectivity for Apple CI ([6ff00bb](https://github.com/tutur3u/platform/commit/6ff00bbeacf59ef8f26eb1910d4650bea8ba12e9))
* **mobile:** pin device info for Apple CI ([5219ee1](https://github.com/tutur3u/platform/commit/5219ee18aedb9feeabb955676443d9a4b80ede86))
* **web:** harden task search and command launcher ([e4f8fd2](https://github.com/tutur3u/platform/commit/e4f8fd28bd78eabb0aa38182af2a32b85b5bf3e0))

## [0.3.1](https://github.com/tutur3u/platform/compare/utils-v0.3.0...utils-v0.3.1) (2026-06-09)


### Bug Fixes

* **ci:** recover releases and package tsgo builds ([d82b846](https://github.com/tutur3u/platform/commit/d82b846c6232d9fb72b7d2aa808020bc24292a19))
* **ci:** restore local supabase e2e port ([f91a4fe](https://github.com/tutur3u/platform/commit/f91a4fed2143a5a4ee8f616ad70bbaf1fa8f2157))
* **ci:** retry transient supabase reset ([3a04a48](https://github.com/tutur3u/platform/commit/3a04a4815b844f27dfa3006fafe3fb0b8ae65f3d))
* **ci:** split supabase reset retry helper ([d1ca984](https://github.com/tutur3u/platform/commit/d1ca984bbffa81b8fc191f97f526310092a5c4f4))
* **external-projects:** expose storage analytics ([fd0b1f4](https://github.com/tutur3u/platform/commit/fd0b1f4b9a7da02dcc3fcb74497f05e7dfb1a8d5))
* **finance:** reduce invoice create read fanout ([69ae9e9](https://github.com/tutur3u/platform/commit/69ae9e904ce6c6d06085e05ffa17ec59a80ee451))
* **tooling:** address review feedback ([dd26db4](https://github.com/tutur3u/platform/commit/dd26db488cd06434a7d192d58ca9ea488d1040ba))

## [0.3.0](https://github.com/tutur3u/platform/compare/utils-v0.2.0...utils-v0.3.0) (2026-06-08)


### Features

* **auth:** share Supabase cookies across apps ([f72ec8e](https://github.com/tutur3u/platform/commit/f72ec8e7a35f13a301b95b2aa916aefbc5848e6e))
* **calendar:** unify provider sync and connections UX ([5db53aa](https://github.com/tutur3u/platform/commit/5db53aa5d5d0ce915c2357cecc89e13b0c2af614))
* **cms:** add audio reel upload workflow ([65e8bb4](https://github.com/tutur3u/platform/commit/65e8bb42ffb9a7d953230f3427a9324fc78c48b7))
* **devbox:** bootstrap platform checkout setup ([84dbff7](https://github.com/tutur3u/platform/commit/84dbff7bac9a4b2848fc6028348fbf429c7f0896))
* **devbox:** execute claimed runner jobs ([2d99e6c](https://github.com/tutur3u/platform/commit/2d99e6cb6b275f7ddf423a021cb1cfcb1d944235))
* **infrastructure:** add stress test observability ([41d8ab3](https://github.com/tutur3u/platform/commit/41d8ab3b0306c96569f0428d6efbc78ccecf9d1a))
* **platform:** add calendar sources and personal Zalo agents ([2746e72](https://github.com/tutur3u/platform/commit/2746e7297a43def06c3c2f12b7751dea94074113))
* **settings:** add fullscreen settings sheet ([809c78e](https://github.com/tutur3u/platform/commit/809c78e6a38ce1623249540e846c63d26cd8d3b9))
* **tasks:** show duration and quick scheduling menu ([9443183](https://github.com/tutur3u/platform/commit/944318327515269a5dce8b1c1ececb28823b0767))
* **web:** add UI component showcase ([8fcbc6b](https://github.com/tutur3u/platform/commit/8fcbc6b4b64c3f9e9da5eb2ddd6d504a83dd2ec4))
* **web:** merge UI component showcase ([5f4e840](https://github.com/tutur3u/platform/commit/5f4e840960a114952d728b88caf914d2e05959b3))
* **web:** redesign user database detail ([f527b10](https://github.com/tutur3u/platform/commit/f527b10af667dde17dab411c3fd0a89386bbb585))


### Bug Fixes

* **auth:** bypass local dev turnstile for passkeys ([433ac00](https://github.com/tutur3u/platform/commit/433ac00a34c17bf8d34712206b542132c87cc914))
* **auth:** clear duplicate shared supabase cookies ([32fbd04](https://github.com/tutur3u/platform/commit/32fbd046a30fadba98eba278107c334aafcd7bde))
* **auth:** honor forwarded origin for server cookies ([37851e0](https://github.com/tutur3u/platform/commit/37851e075697152b50fc3c711d0c3aa6e8bf5d5c))
* **auth:** preserve satellite Supabase sessions ([a8b49bb](https://github.com/tutur3u/platform/commit/a8b49bb2d29f42b4a0267aadd5d2e2fd1074aeab))
* **auth:** require configured turnstile for dev passkeys ([80066ca](https://github.com/tutur3u/platform/commit/80066ca950783bccd0155b6192d72ea136203d65))
* **auth:** split shared-ip login rate limits ([1cbbd2f](https://github.com/tutur3u/platform/commit/1cbbd2f1f37512204640b4d309395786243f05de))
* **auth:** stabilize satellite Supabase sessions ([231c4fa](https://github.com/tutur3u/platform/commit/231c4fac3238b94c96ad8e7a853b03ad97d166e4))
* **auth:** standardize satellite Supabase sessions ([4a96fa2](https://github.com/tutur3u/platform/commit/4a96fa24e680937dc7ae44474cfef51329e314f9))
* **auth:** support supabase-first satellite sessions ([b014fcf](https://github.com/tutur3u/platform/commit/b014fcf6db8218a1b54fd79f5e13629f66cad090))
* **chat:** use local root workspace logo ([6c91094](https://github.com/tutur3u/platform/commit/6c91094add72acf84e50b6cd49b6301cd7f7a896))
* **ci:** align package provenance metadata ([0f7ef88](https://github.com/tutur3u/platform/commit/0f7ef8834c0054b020c3eaa1042bfcf10145ab1a))
* **ci:** exercise shared localhost domain in e2e ([c864b94](https://github.com/tutur3u/platform/commit/c864b94aeda0519b74fcd9368451c0f7b54f23ce))
* **ci:** fail fast package release gates ([a6f96bf](https://github.com/tutur3u/platform/commit/a6f96bff157e676a01e05a1a418775e558377757))
* **ci:** gate package releases before deploy ([a989471](https://github.com/tutur3u/platform/commit/a989471041c095bbedacbf844ef3ee3991775fab))
* **ci:** harden workflow guardrails ([2e646c2](https://github.com/tutur3u/platform/commit/2e646c29079380ef49b238f39305058174c4e9f1))
* **ci:** retry transient Docker registry failures ([d008f0d](https://github.com/tutur3u/platform/commit/d008f0d63dd92b69c86bb152b257c92c1d9f99c9))
* **ci:** stabilize bun setup and prerender builds ([b410173](https://github.com/tutur3u/platform/commit/b410173835688e7fff0a846b7bdfc7e5897915b9))
* **ci:** stabilize current test workflows ([43f6022](https://github.com/tutur3u/platform/commit/43f60220645246ea4a423b0417169203e9345b2f))
* **ci:** stabilize docker e2e setup ([b280958](https://github.com/tutur3u/platform/commit/b2809587c06ca571c804d9ad43424decc1786b73))
* **ci:** stabilize dockerized e2e proxying ([92480a3](https://github.com/tutur3u/platform/commit/92480a3034e896768260a8a67c730fe09bfa7c7c))
* **ci:** stabilize e2e portless and auth cookies ([79d146a](https://github.com/tutur3u/platform/commit/79d146ad9b9b7fbd7e9b1cdd2c5cc38cef21d72d))
* **ci:** stabilize main checks ([5fdf019](https://github.com/tutur3u/platform/commit/5fdf019283fd9765075afea82444444429a82916))
* **ci:** stabilize package release workflows ([d6243c2](https://github.com/tutur3u/platform/commit/d6243c2d7ee7ae599d9f17fba4be9f9cc71a1722))
* **ci:** stabilize production deployment checks ([1973c9e](https://github.com/tutur3u/platform/commit/1973c9e18dd2d63d7bd3a93dbd0cf35413548c1f))
* **ci:** stabilize shortener and crypto coverage ([62a16ee](https://github.com/tutur3u/platform/commit/62a16ee2771e6b5f99c95371db62cd39feab4d75))
* **ci:** start shared localhost proxy for e2e ([070cea0](https://github.com/tutur3u/platform/commit/070cea0f1b0ae493216ce531703c535757ae1c5e))
* **ci:** unblock e2e docker builds ([7a09469](https://github.com/tutur3u/platform/commit/7a09469822261d1b82e07d969c4e61885a54d5f6))
* **cms:** stabilize root admin project test ([54ee986](https://github.com/tutur3u/platform/commit/54ee986a58472140bb87317bf4760b3f50c38c9f))
* **devbox:** accept CLI app-session auth ([2e1080e](https://github.com/tutur3u/platform/commit/2e1080e34285399f083a6b8c17a9ee73cb8ecd5f))
* **e2e:** harden portless readiness ([ee0e373](https://github.com/tutur3u/platform/commit/ee0e373a2f37ad7d1a869a065bad4673775297ef))
* **e2e:** honor forwarded localhost auth origins ([abbbf5f](https://github.com/tutur3u/platform/commit/abbbf5ff224fe2ce50a09483c17731067738c227))
* **e2e:** stabilize native auth bypass ([c3dee2f](https://github.com/tutur3u/platform/commit/c3dee2fdb557d211a2d56792ab4fc472497aa9f2))
* **e2e:** stabilize portless readiness in CI ([9d80a1f](https://github.com/tutur3u/platform/commit/9d80a1f819f54e08f4953bbabb3e88f33bd79714))
* **finance:** restore subscription checkout flow ([1e4cf62](https://github.com/tutur3u/platform/commit/1e4cf62e4c80f15e5c25feeb2b4ff3ab659edd72))
* **finance:** restore subscription invoice auto-products ([515f449](https://github.com/tutur3u/platform/commit/515f4499f8eb057e3dd4fb43a85186a31cbac106))
* **infrastructure:** queue stress tests through control files ([19139ed](https://github.com/tutur3u/platform/commit/19139ed651f88c067c4741b4f7b375b5283d15c4))
* **tasks:** avoid RPC for simple board search ([7a2aeea](https://github.com/tutur3u/platform/commit/7a2aeeae77852cb7b8d5bec7ef0775a67cfe3e71))
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
* **web:** canonicalize Supabase avatar URLs ([b5de365](https://github.com/tutur3u/platform/commit/b5de365657f8183956f276345071dbf775207c8b))
* **web:** clarify passkey turnstile blocking ([5e0c836](https://github.com/tutur3u/platform/commit/5e0c83661f7729457e9ba8fec9b45f3ab9c2d1e7))
* **web:** harden Polar workspace setup ([dfeca14](https://github.com/tutur3u/platform/commit/dfeca1442776d2b162d9527fcbf8b14bc161d650))
* **web:** quiet calendar oauth callbacks ([9a1163e](https://github.com/tutur3u/platform/commit/9a1163e57cdade193965669514ebb66bc2dfe8eb))
* **web:** render login page on hard loads ([34cf79c](https://github.com/tutur3u/platform/commit/34cf79c3a171fca5c5eed4fd24e379afa6215cd8))
* **web:** repair users database requests ([15670b0](https://github.com/tutur3u/platform/commit/15670b0e5b69a0f450115ad5f4228a07e12e1cb0))
* **web:** require captcha for remote dev passkeys ([fc9959a](https://github.com/tutur3u/platform/commit/fc9959a460598c0cc39c3de51a02c6162688c38e))
* **web:** route login through auth APIs ([221e83c](https://github.com/tutur3u/platform/commit/221e83cbb14302c6fae4d0548b5023887a19c3e5))
* **web:** stabilize local login development ([37f660e](https://github.com/tutur3u/platform/commit/37f660e0d2d1fe3a9f02e38a96f04272e87355df))
* **web:** surface password captcha failures ([03b3191](https://github.com/tutur3u/platform/commit/03b31914d9b621e893215c4c9aa370761aa97e83))
* **web:** use local footer logo in dev ([f45ed5c](https://github.com/tutur3u/platform/commit/f45ed5cef2278f85d35bbcd2af76555e53b3a616))
* **web:** use local workspace logo fallback ([d32bee7](https://github.com/tutur3u/platform/commit/d32bee79537bdf69e17c0734a55d40591ae15fe9))
* **web:** use local workspace logo fallback ([6651fb7](https://github.com/tutur3u/platform/commit/6651fb7319df91ae46a78a25d1494c1daa4f7b46))
* **web:** wrap ui showcase form preview ([d8be4bc](https://github.com/tutur3u/platform/commit/d8be4bcb244a708941c28f9098a44b1baa3c11e1))


### Performance Improvements

* **dev:** isolate current web compile traces ([5201515](https://github.com/tutur3u/platform/commit/520151533815850dc76ceeb11669c2f50d687955))
* **next:** centralize app dev config defaults ([669a578](https://github.com/tutur3u/platform/commit/669a578163336dc6fd6399e753328598b03c1f2a))
* **next:** centralize shared app defaults ([6df241c](https://github.com/tutur3u/platform/commit/6df241c8be16b349ccb6cb91bd2b621b8598603f))
* **tasks:** filter task boards through server RPCs ([657f445](https://github.com/tutur3u/platform/commit/657f4458cd40c2e31774c7d9ef0628f986af1838))
* **ui:** defer sidebar preference sync ([c476b81](https://github.com/tutur3u/platform/commit/c476b818bc5b5c08067317884c530c87b46ac7e9))
* **web:** defer calendar preference queries ([94e0190](https://github.com/tutur3u/platform/commit/94e0190737cb359c5ac15fbfa4da711a8c4e4cdf))
* **web:** defer dashboard chat compile graph ([a3fda9d](https://github.com/tutur3u/platform/commit/a3fda9dcbaac287f925289ee23282fdd77e58474))
* **web:** defer dashboard chrome widgets ([0fd5f0a](https://github.com/tutur3u/platform/commit/0fd5f0a70c823c221e25afc275c54d2caf30bc4d))
* **web:** defer dashboard fade setup ([09e5300](https://github.com/tutur3u/platform/commit/09e5300285bd77a107730ad6abcac66f5cdc5e4f))
* **web:** defer dashboard navigation icons ([67ba3c8](https://github.com/tutur3u/platform/commit/67ba3c8f7111a27dfb0cb37307fc33a65440d3d9))
* **web:** defer dashboard navigation icons ([9a79554](https://github.com/tutur3u/platform/commit/9a795541f0655dbff9580bb41ca7d696d96c1f82))
* **web:** defer dashboard page helpers ([1ddf6f1](https://github.com/tutur3u/platform/commit/1ddf6f18ec647318af71ccc5e0e68c0e9bb7aa06))
* **web:** defer dashboard settings host ([f21f012](https://github.com/tutur3u/platform/commit/f21f0123c9f443f9300fc36fbbd10460343fef02))
* **web:** defer dashboard shell icons ([7cc25e7](https://github.com/tutur3u/platform/commit/7cc25e783993ab5e1eb5ce7a27cbbe2b9b426ee3))
* **web:** defer dashboard shell providers ([b2ad682](https://github.com/tutur3u/platform/commit/b2ad6820b1705f225decdbc79459bc4008d64ed7))
* **web:** defer dashboard shell widgets ([80de955](https://github.com/tutur3u/platform/commit/80de955285d280719ad2254f0856ce8335ad56cc))
* **web:** defer optional sidebar helpers ([1d2b2c8](https://github.com/tutur3u/platform/commit/1d2b2c8397c3dc8139355030dcfb3544c8f24b14))
* **web:** defer workspace navigation helpers ([0301cd1](https://github.com/tutur3u/platform/commit/0301cd1be99a28d96c73505a1aa4d9c6bd57e23a))
* **web:** defer workspace structure helpers ([8a41034](https://github.com/tutur3u/platform/commit/8a41034f4a2ea606a7de1fcd5dd3ed7660dd852d))
* **web:** gate dashboard quick actions compile ([59650ce](https://github.com/tutur3u/platform/commit/59650ce7fbd6d64d9a62c655fafe7e583daf016d))
* **web:** improve local dev compile speed ([b9df46e](https://github.com/tutur3u/platform/commit/b9df46e9cbd8f3189d074229dc0f26da2670e8ed))
* **web:** narrow workspace layout compile graph ([ad7a9d9](https://github.com/tutur3u/platform/commit/ad7a9d909a1cde1e27890818817dfc335d4b8f9f))
* **web:** narrow workspace shell compile graph ([7544319](https://github.com/tutur3u/platform/commit/754431996d594961f4d279be522e043fe5ff3d62))
* **web:** return proxy not found directly ([b831995](https://github.com/tutur3u/platform/commit/b8319957aeebe658bac651fb61e0c3e9978a5c4f))
* **web:** shrink cache components compile graph ([f07fe3f](https://github.com/tutur3u/platform/commit/f07fe3f6041d2c558da590434ac0af4b1f8674c6))
* **web:** slim dashboard navigation imports ([81d7a45](https://github.com/tutur3u/platform/commit/81d7a456b9edd7061abc06448c0fc8b1348e3f55))
* **web:** split dashboard constants graph ([55c7578](https://github.com/tutur3u/platform/commit/55c7578f40647dca8f81787101d34e71f66c2012))
* **web:** split dashboard insight summaries ([f2dd007](https://github.com/tutur3u/platform/commit/f2dd0077b722bdedc0ce08879f2f1e75c4961b0e))
* **web:** split dashboard route compile graph ([2868015](https://github.com/tutur3u/platform/commit/2868015420cebe5c8ba05824e18c8a97a44dafdc))
* **web:** split dashboard task providers ([2e970ce](https://github.com/tutur3u/platform/commit/2e970cef4994875b4a3bd1c53fa95608cde9a44f))
* **web:** split dashboard workspace shell compile graph ([3a01e00](https://github.com/tutur3u/platform/commit/3a01e00852e99d642a6946f8d56e06976435323d))
* **web:** split Mira dashboard selector ([08c5e19](https://github.com/tutur3u/platform/commit/08c5e19da9e5c37708ad594e44092de72f3926ca))
* **web:** split workspace providers ([05d8f68](https://github.com/tutur3u/platform/commit/05d8f682abb4b9282462767d2ade3c50899dad02))
* **web:** split yjs-heavy server compile graph ([8420fd4](https://github.com/tutur3u/platform/commit/8420fd443bf63c9809283087a71302616ba0aed5))
* **web:** streamline dashboard workspace shell ([057958c](https://github.com/tutur3u/platform/commit/057958c031fe3ba312c2ac2f4794b4eff9c64dea))
* **web:** trim dashboard root compile graph ([033d671](https://github.com/tutur3u/platform/commit/033d671a1d06f7725bfc1cea2656d47efcac04c1))
* **web:** trim dashboard workspace compile graph ([9b7296d](https://github.com/tutur3u/platform/commit/9b7296d648f9e0239d2640d6bd67207c2e01ac06))

## [0.2.0](https://github.com/tutur3u/platform/compare/utils-v0.1.0...utils-v0.2.0) (2026-06-03)


### Features

* **chat:** add generated titles and personal sections ([10234b4](https://github.com/tutur3u/platform/commit/10234b4b8d48eb44828b89f86b7fcf59d587432e))
* **devbox:** add remote devbox foundation ([88f81d2](https://github.com/tutur3u/platform/commit/88f81d2a369ba80a3ee601122ca10d9031b63b87))


### Bug Fixes

* **ai:** charge markitdown url conversions ([ad3b3bc](https://github.com/tutur3u/platform/commit/ad3b3bc368f888fcac4b4d853f5a9847e711f138))
* **ai:** meter parallel check subagents ([e3710f4](https://github.com/tutur3u/platform/commit/e3710f4227a95e13335a539026513836c0a482c0))
* **ai:** preserve vertex model routing ([27d5d7d](https://github.com/tutur3u/platform/commit/27d5d7dce5a0b2c5a2d5b20eb10be52b13b933cc))
* **ai:** require authoritative credit preflight ([c479d9b](https://github.com/tutur3u/platform/commit/c479d9b69939b549547d81c8b7399d0930e249da))
* **ai:** verify task board Mira context ([b971899](https://github.com/tutur3u/platform/commit/b971899144c7a3d353b313e7ad97151b6b8a81b4))
* **auth:** normalize satellite login redirects ([fbf45da](https://github.com/tutur3u/platform/commit/fbf45dab3dc03397aa5eb225e1ba913905e94d9f))
* **auth:** require refresh tokens for cross-app refresh ([debfd34](https://github.com/tutur3u/platform/commit/debfd348484414e36ec330d61ce3ea1f3174fe4f))
* **chat:** restore title generation and pagination ([f85df59](https://github.com/tutur3u/platform/commit/f85df59fba274c694fd38a991607e8d263ae1af3))
* **chat:** support ai-agent title and gateway verification ([296cd07](https://github.com/tutur3u/platform/commit/296cd0727b56b8b2440e6877932c74fcad07e800))
* **ci:** surface dockerized e2e failures ([9e251d1](https://github.com/tutur3u/platform/commit/9e251d1cac13b897528f0eda94748f7b04d24bc0))
* **cron:** protect announcement queue sends ([5a608df](https://github.com/tutur3u/platform/commit/5a608dfb0df463a88c5597b5577d7f15d8b34f52))
* **database:** bind mind patches to board workspaces ([e57c8c3](https://github.com/tutur3u/platform/commit/e57c8c341eba421db9825c316cc9acc5c0159bec))
* **database:** bind tulearn learner state to members ([70fce8d](https://github.com/tutur3u/platform/commit/70fce8d3d93063cf1b9f6010035ced89648a9949))
* **database:** guard pending invoice rpcs ([0573c04](https://github.com/tutur3u/platform/commit/0573c04c7c643fc91828f42d24bbf65382d22764))
* **database:** guard personal task placement rpc ([307b6a8](https://github.com/tutur3u/platform/commit/307b6a84807288d0a5b9740f7e974330d5cf43a3))
* **database:** harden abuse trust overrides ([34fa1a3](https://github.com/tutur3u/platform/commit/34fa1a3d0086e43000b77667aceae4bd65876819))
* **database:** redact tag stats confidential amounts ([4823c36](https://github.com/tutur3u/platform/commit/4823c3653244bf8f9d960dc7182e8ab45827986a))
* **devbox:** honor forwarded CLI flags ([bf999fb](https://github.com/tutur3u/platform/commit/bf999fbedb7c2ca88cf6db12f72193a17b63c546))
* **docker:** bind staged ports to loopback ([28baec7](https://github.com/tutur3u/platform/commit/28baec744e90039dc64e64105262ca7dafa34f47))
* **docker:** gate blue green promotion ([985fb4d](https://github.com/tutur3u/platform/commit/985fb4d88e66801431d3c709b3153c81d1daa8a7))
* **docker:** harden drain status probes ([b949dbb](https://github.com/tutur3u/platform/commit/b949dbb2cba638d2b4c1b1ad2be9645bc1b40a4b))
* **docker:** redact deployment lock tokens ([a50a051](https://github.com/tutur3u/platform/commit/a50a051d928c6f246586afe0d63e04b131841eed))
* **e2e:** keep rate-limit reads below proxy budget ([19b8ef3](https://github.com/tutur3u/platform/commit/19b8ef3d348d2070ba9e6ec85e4699d20a818beb))
* **e2e:** restore native suite and ci checks ([e178873](https://github.com/tutur3u/platform/commit/e178873854ab6e5a834e09e1f54b773748cd933a))
* **education:** bound pronunciation character alignment ([c9ad2bf](https://github.com/tutur3u/platform/commit/c9ad2bf3b20a9ff38007a0dac223c16d105d76fe))
* **education:** bound pronunciation word alignment ([9bdc989](https://github.com/tutur3u/platform/commit/9bdc98944477081609cf327f0e07cce1e622c3f5))
* **education:** cap assessor audio decoding ([3a697ff](https://github.com/tutur3u/platform/commit/3a697ffcd84d2decc381f079eac1f98efcc7b82a))
* **education:** enforce valsea feature access ([ffcd0ab](https://github.com/tutur3u/platform/commit/ffcd0abb340eaad9cd4d115db351ce2be4c93120))
* **education:** gate valsea audio uploads ([b6b2e11](https://github.com/tutur3u/platform/commit/b6b2e115885086d31f62aed2426fdbd559f15a77))
* **education:** guard assessor model controls ([a89d0fc](https://github.com/tutur3u/platform/commit/a89d0fc48f2b2240711abd75e4602d5dcf18a8de))
* **education:** sanitize local speech errors ([72f2aec](https://github.com/tutur3u/platform/commit/72f2aec340008d8592ffd95d76a0a9b8583c1c9d))
* **finance:** bind invoice customers to workspace ([c5eafc6](https://github.com/tutur3u/platform/commit/c5eafc6bd26d4a097451b83b1504438561223740))
* **finance:** cap sepay retry delays ([707b54d](https://github.com/tutur3u/platform/commit/707b54d1f5a158e72213ff8ce54f61e12cc648d8))
* **finance:** claim sepay webhook retries ([671b2c6](https://github.com/tutur3u/platform/commit/671b2c6c6513d2717850bf4c9cf7a83f7b0d5976))
* **finance:** enforce attachment upload limits ([e326c11](https://github.com/tutur3u/platform/commit/e326c11de70079b85f28e05b21cf22fe153959f4))
* **finance:** enforce transaction visibility for attachments ([53295e2](https://github.com/tutur3u/platform/commit/53295e280f99920c6f400b7584f0cac2f625d794))
* **finance:** hide confidential signs in type filters ([a6cbd33](https://github.com/tutur3u/platform/commit/a6cbd33425856639daaaab46e85c98d096904f12))
* **finance:** sign sepay oauth state ([2d8018e](https://github.com/tutur3u/platform/commit/2d8018e6bc100a11e2f4c862ddef04ac49c8869c))
* **hive:** bind trades to server npcs ([fa99b97](https://github.com/tutur3u/platform/commit/fa99b9702204c4062d7cfe46d8688f69ae49f861))
* **hive:** bound object footprints ([436c835](https://github.com/tutur3u/platform/commit/436c835b58c8c57ff7c5b262d58d0c61f66c6dca))
* **hive:** filter hidden workflow timeline runs ([f2daf3d](https://github.com/tutur3u/platform/commit/f2daf3de433ae0c70f38f881013cf05d73b1f620))
* **hive:** hide email from presence ([5ba5e58](https://github.com/tutur3u/platform/commit/5ba5e58cfdbd23c983c5d8ae38c14a3ba2bd6d78))
* **hive:** narrow browser recovery clearing ([4f06d9e](https://github.com/tutur3u/platform/commit/4f06d9efd8577f2c884586deda0daa3f50e9d419))
* **hive:** reject untrusted realtime events ([4f560d8](https://github.com/tutur3u/platform/commit/4f560d8aa6365759256ea45ea843f797b688af98))
* **hive:** require admin for world resets ([aae2e4b](https://github.com/tutur3u/platform/commit/aae2e4b13259ec66a259e35d4b6943eaa5326583))
* **hive:** validate workflow action configs ([e113653](https://github.com/tutur3u/platform/commit/e1136537b4cdd29cf0957697bc9d182e1b23b6c6))
* **infrastructure:** bind observability cursors before caps ([62d0826](https://github.com/tutur3u/platform/commit/62d0826a1ae8dc75921563fde332303d27c5e6a5))
* **infrastructure:** cap request archive aggregation ([2299cf8](https://github.com/tutur3u/platform/commit/2299cf8305851450dd7276f9fd7579207c4f2690))
* **infrastructure:** redact request archive console logs ([beeb0ba](https://github.com/tutur3u/platform/commit/beeb0ba42701118b0af8d92be7791f3f1bbd634e))
* **infrastructure:** require operators for cron controls ([3b411a2](https://github.com/tutur3u/platform/commit/3b411a2f1588258eac33f49c08b55d320b7b0ba8))
* **infrastructure:** skip unauthorized cron drain writes ([977ee2c](https://github.com/tutur3u/platform/commit/977ee2c9c70f9f5413ad3bc8ca4f1e4e78f25f10))
* **inventory:** narrow finance app-session access ([94da0ef](https://github.com/tutur3u/platform/commit/94da0efea7cef9e7ce30ec8a21be70a0f4d79c87))
* **learn:** require durable ai chat ids ([a30f4cd](https://github.com/tutur3u/platform/commit/a30f4cdf0182a1a095c06f0e8dea14298dcc1377))
* **learn:** use learner course access ([2134e91](https://github.com/tutur3u/platform/commit/2134e91f009bb0ea5f7d3de8d6dbec71e9b67438))
* **meet:** protect workspace plan detail pages ([2574e45](https://github.com/tutur3u/platform/commit/2574e45d5a44db3425438233794bd620abfec778))
* **mobile:** fail closed on logout errors ([27a89d8](https://github.com/tutur3u/platform/commit/27a89d89ad6ab0fffbfc0faaa815bb01ba037d42))
* **mobile:** keep workspace secrets off disk ([bf0a7e4](https://github.com/tutur3u/platform/commit/bf0a7e4867b623749781dac854937228316091eb))
* **mobile:** neutralize crm csv formulas ([5290f81](https://github.com/tutur3u/platform/commit/5290f81efb0a2c495ebcce98056f9264e0543695))
* **mobile:** redact auth account secrets ([eb1c03c](https://github.com/tutur3u/platform/commit/eb1c03c1b8405f410e7770873ac5c271789ec936))
* **release:** repair package publishing metadata ([88d9a6d](https://github.com/tutur3u/platform/commit/88d9a6dcc3556b1d1aa677c0592a1e1901a389e3))
* **sdk:** escape cli selector text ([a48e4c5](https://github.com/tutur3u/platform/commit/a48e4c540d9e5474ea40bcb80610285340154cbc))
* **sdk:** keep cli bearer tokens same-origin ([96b8757](https://github.com/tutur3u/platform/commit/96b8757097a75e8f2f0421008c38dc07d81393ea))
* **storage:** cap unzip proxy memory defaults ([7bccecf](https://github.com/tutur3u/platform/commit/7bccecfc0e3d853a128c3c49bccbe09d104df789))
* **storage:** keep unzip callbacks guarded ([9b9e47f](https://github.com/tutur3u/platform/commit/9b9e47f58ffb5e9d7e38989d329d51bed2e6a0ac))
* **storage:** mediate external project asset uploads ([e653210](https://github.com/tutur3u/platform/commit/e6532109fc20d54f2df1c11cd2412af6ca1dc185))
* **storage:** mediate group storage uploads ([df4a52d](https://github.com/tutur3u/platform/commit/df4a52ddbde12c72563aa771592268a5640d6bf9))
* **storage:** narrow app-session audiences ([f1acd28](https://github.com/tutur3u/platform/commit/f1acd28d1483e47fa4475f6c1ff0a189ec17d7b4))
* **storage:** validate unzip upload destinations ([bd9a180](https://github.com/tutur3u/platform/commit/bd9a180775e2cc0d9b2e87b712b5fb471f2a1f16))
* **tasks:** aggregate board list task counts ([4774993](https://github.com/tutur3u/platform/commit/477499316126bfa6ba1a9a0603514a718e2c35f1))
* **tasks:** enforce member access for external defaults ([87eba13](https://github.com/tutur3u/platform/commit/87eba13deeb9d65f0ee89658fcbe6adfd511d20c))
* **tasks:** require member source workspace access ([194d0ef](https://github.com/tutur3u/platform/commit/194d0efcfc3d859cb63f708181de42ddaa4a8f33))
* **tasks:** route board app sessions through wrapper ([17d311f](https://github.com/tutur3u/platform/commit/17d311f2cab5df8c776ef0f9077192582d781cb8))
* **tasks:** validate journal label workspace ([5abdbb4](https://github.com/tutur3u/platform/commit/5abdbb41fc022fb3467bde0e456d7e63b322d5d4))
* **tasks:** validate task description yjs content ([0615184](https://github.com/tutur3u/platform/commit/06151845b24fb7f9cb9526eb8dd8ce1784961a33))
* **ui:** bind stale task mentions to route workspace ([344773f](https://github.com/tutur3u/platform/commit/344773f7b3b04634a11423c8c31c95fefa0ec437))
* **ui:** refetch task dialog broadcast updates ([d7259b6](https://github.com/tutur3u/platform/commit/d7259b61daa33cb933df0c68222f43352e31b743))
* **ui:** scope task mention resolution cache ([ef60769](https://github.com/tutur3u/platform/commit/ef607698f220a8e798ef797ffc90690b1711b3bd))
* **users:** bind attendance exports to workspace ([6960bdf](https://github.com/tutur3u/platform/commit/6960bdfe6e1db154dd5921a758aa79fa6fa3f978))
* **utils:** avoid suspensions on backend 429 ([cf64d49](https://github.com/tutur3u/platform/commit/cf64d49f931619aca738ae1ab5467be7a4778aac))
* **utils:** distrust raw app session cookies ([a2177d9](https://github.com/tutur3u/platform/commit/a2177d90714d7d8afc76cc3a4c2e31e08f575d3f))
* **utils:** keep proxy limits during redis failures ([4af3f19](https://github.com/tutur3u/platform/commit/4af3f192233c13b98b00948fb2ff626f0ff92f8d))
* **utils:** rate limit unverified proxy callers ([5eeebe5](https://github.com/tutur3u/platform/commit/5eeebe5d8bbede740157ac72fb61918d918e28db))
* **web:** bind group post details to workspace ([201c11c](https://github.com/tutur3u/platform/commit/201c11c24de9f202fa85eaf2a77d6b27db37f4aa))
* **web:** enforce learner course assignments ([1d4795c](https://github.com/tutur3u/platform/commit/1d4795c1ce696613fc1b8df222c013767ba0ad6b))
* **web:** hide inaccessible invite metadata ([3594937](https://github.com/tutur3u/platform/commit/359493753f2b4e50280ffc33a0c132003d70d50f))
* **web:** hide tutoring conflict identifiers ([dc075ee](https://github.com/tutur3u/platform/commit/dc075ee9ea33a0e86ceee1cca1dc8a53fb4660a3))
* **web:** keep canonical project schemas immutable ([f41bde0](https://github.com/tutur3u/platform/commit/f41bde06a014278661297d70428c474830af9f89))
* **web:** protect education attempts data ([060e78a](https://github.com/tutur3u/platform/commit/060e78acfa808828f09214de1dbe198a754be48f))
* **web:** require confirmation for browser reset ([2626c0c](https://github.com/tutur3u/platform/commit/2626c0c5809dc7ed92c295897cc84a17e47356a1))
* **web:** route post filters through private rpc ([93040e6](https://github.com/tutur3u/platform/commit/93040e6f7ff18ca0e7691092a37f076937baa4b5))
* **web:** validate auth before bypassing api abuse blocks ([8cb12bc](https://github.com/tutur3u/platform/commit/8cb12bcf30209ef054c6a53d55f73a24b6dca0de))

## [0.1.0](https://github.com/tutur3u/platform/compare/utils-v0.0.1...utils-v0.1.0) (2026-06-02)


### Features

* **chat:** add ai agent operations controls ([2429279](https://github.com/tutur3u/platform/commit/2429279777e74014abb80699a7359038eb751460))


### Bug Fixes

* **ci:** publish packages to npm only ([24d0823](https://github.com/tutur3u/platform/commit/24d0823e023ed346706cdb00ef93434c7b91ac02))
* **ci:** resolve failing workflow jobs ([8b3ed90](https://github.com/tutur3u/platform/commit/8b3ed907c04d11c65a7af2b6eac45985a463d2a8))

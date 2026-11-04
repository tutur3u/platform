:robot: I have created a release *beep* *boop*
---


<details><summary>platform: 0.73.0</summary>

## [0.73.0](https://github.com/tutur3u/platform/compare/platform-v0.72.0...platform-v0.73.0) (2026-11-04)


### Features

* **abuse-guard:** add Durable Object guard store Worker ([#6837](https://github.com/tutur3u/platform/issues/6837)) ([41970d1](https://github.com/tutur3u/platform/commit/41970d183e9120b7ed03ddc53d69301525b78a8a))
* **ai:** add private Meet transcription evaluation harness ([#7269](https://github.com/tutur3u/platform/issues/7269)) ([28a5503](https://github.com/tutur3u/platform/commit/28a5503f53655583230e95046869485012a72575))
* **ai:** create Mira chat with the first message ([#6765](https://github.com/tutur3u/platform/issues/6765)) ([aae4d08](https://github.com/tutur3u/platform/commit/aae4d088b0225d428bce41153bac7cf204d5a8dd))
* **auth:** guard staging cookie scope with explicit deploy environment ([#7315](https://github.com/tutur3u/platform/issues/7315)) ([25c85aa](https://github.com/tutur3u/platform/commit/25c85aa8b0e9b08a03aace0cab90aaa75ebd6bfd))
* **calendar:** admit native production cutover ([#6952](https://github.com/tutur3u/platform/issues/6952)) ([1269e31](https://github.com/tutur3u/platform/commit/1269e310101f1b360ab1dadf0311cafe8a3d337a))
* **calendar:** split staging and production hosts and verify Access on staging ([#7318](https://github.com/tutur3u/platform/issues/7318)) ([e1f9a4c](https://github.com/tutur3u/platform/commit/e1f9a4c69f948c9a458b4adc15f01d6e82807ea4))
* **ci:** add the Access ingress class, topology preflight and readback ([#7320](https://github.com/tutur3u/platform/issues/7320)) ([e5032f4](https://github.com/tutur3u/platform/commit/e5032f4267eb266a8900c396df8f3fcd823da5df))
* **ci:** admit attested sourceDigest rebinds of definer verified records ([#7423](https://github.com/tutur3u/platform/issues/7423)) ([e21af76](https://github.com/tutur3u/platform/commit/e21af763bd11b991a0db1026a7b9b01a0c163b19))
* **ci:** extend SQL grant guard for declarative safety ([#7249](https://github.com/tutur3u/platform/issues/7249)) ([482f819](https://github.com/tutur3u/platform/commit/482f8195fefcee7beabfb3574743ddd8c48eea18))
* **ci:** publish the staging Web issuer and its protected Next fallback ([#7323](https://github.com/tutur3u/platform/issues/7323)) ([aa8444a](https://github.com/tutur3u/platform/commit/aa8444a10c3604d4018bea85ac89d6ee245ef95e))
* **contacts:** add default-off Start candidate ([#7120](https://github.com/tutur3u/platform/issues/7120)) ([9a7795d](https://github.com/tutur3u/platform/commit/9a7795d2036bb1be9c346b3461abeef8f4eb0642))
* **contacts:** add teacher topic form and supervisor assignment ([#6929](https://github.com/tutur3u/platform/issues/6929)) ([2ef4ddc](https://github.com/tutur3u/platform/commit/2ef4ddce414748093bba366211698ab4f9fc5385))
* **contacts:** add tutoring teacher công report ([#7297](https://github.com/tutur3u/platform/issues/7297)) ([770665b](https://github.com/tutur3u/platform/commit/770665b7303ead6264845c9e7679f09cb09c169e))
* **contacts:** monthly GVNN schedule editor with month clone ([#6927](https://github.com/tutur3u/platform/issues/6927)) ([13c4e0b](https://github.com/tutur3u/platform/commit/13c4e0b43cdc20a4566187386a8eecf21157a79b))
* **contacts:** pick an existing topic contact in the add-contact form ([#7047](https://github.com/tutur3u/platform/issues/7047)) ([f025e29](https://github.com/tutur3u/platform/commit/f025e290bbf0acd7ede7554876dc2a1f8ff18dd1))
* **database:** add declarative schema parity pack and privilege probes ([#7250](https://github.com/tutur3u/platform/issues/7250)) ([9a8f181](https://github.com/tutur3u/platform/commit/9a8f181ac81306443594f8439f88f88289367121))
* **database:** add topic teacher deadline notice types and receipts ([#6975](https://github.com/tutur3u/platform/issues/6975)) ([ee987de](https://github.com/tutur3u/platform/commit/ee987dec1d739c81a8d5eeda0502aa2c436249bf))
* **database:** bind external-project helpers to the caller ([#7119](https://github.com/tutur3u/platform/issues/7119)) ([72ad410](https://github.com/tutur3u/platform/commit/72ad410c6862644e504a6781470c4c38c6ae64af))
* **database:** bind remaining membership helpers to the caller ([#7128](https://github.com/tutur3u/platform/issues/7128)) ([8f95a90](https://github.com/tutur3u/platform/commit/8f95a90945814df9b81ac67d3e8340973051f925))
* **database:** tutoring automation foundation ([#7254](https://github.com/tutur3u/platform/issues/7254)) ([dcc7d73](https://github.com/tutur3u/platform/commit/dcc7d73e488cabedda8874803201ce5c69e57b7f))
* **drive:** add staging Start candidate ([#7085](https://github.com/tutur3u/platform/issues/7085)) ([a211868](https://github.com/tutur3u/platform/commit/a2118681d88fa5073b6b7421e9357824505650b0))
* **hive:** add Cloudflare maintenance and native migration plan ([#6868](https://github.com/tutur3u/platform/issues/6868)) ([00f1071](https://github.com/tutur3u/platform/commit/00f107166aab3428cc97e84e5284ec13ff127447))
* **infrastructure:** add the private ops hub gateway ([#6997](https://github.com/tutur3u/platform/issues/6997)) ([c7be6a7](https://github.com/tutur3u/platform/commit/c7be6a7b766ce04085887cdf5510f62611bf46d8))
* **legal:** redesign What changed with a gated bilingual notice ([#7228](https://github.com/tutur3u/platform/issues/7228)) ([e92a6e4](https://github.com/tutur3u/platform/commit/e92a6e4682fbbf266ec51eff26d91a3309ad6d0a))
* **mail:** adopt the shared Start bridge and request mounts ([#6763](https://github.com/tutur3u/platform/issues/6763)) ([d3621e5](https://github.com/tutur3u/platform/commit/d3621e508fcd17c11c781baddb82c7ce42e7886f))
* **mail:** settle the sync icon smoothly and move the mail source into Settings ([#7145](https://github.com/tutur3u/platform/issues/7145)) ([7df69df](https://github.com/tutur3u/platform/commit/7df69df8b8a845d2371802aa7a32e5c150a18097))
* **mail:** tighten the inbox list hierarchy and density ([#7146](https://github.com/tutur3u/platform/issues/7146)) ([5218adf](https://github.com/tutur3u/platform/commit/5218adf56b8fcd7a811020a0bfdc0e976750975f))
* **mastermind:** accept push event v2 with urgency ([#7210](https://github.com/tutur3u/platform/issues/7210)) ([1e0570d](https://github.com/tutur3u/platform/commit/1e0570db8916d947360c0f821d4908e3be9e5c08))
* **mastermind:** add the Inbox ask card and accept the new hub fields ([#7395](https://github.com/tutur3u/platform/issues/7395)) ([fe316e8](https://github.com/tutur3u/platform/commit/fe316e8f95f3e569e26be81faac9fef56c8f8a1f))
* **mastermind:** add the Inbox ask-v2 contract and shared fixture ([#7390](https://github.com/tutur3u/platform/issues/7390)) ([3371d16](https://github.com/tutur3u/platform/commit/3371d16e41c65551939195fb8e2cdcdfb71ccdcf))
* **mastermind:** batch sheet v2, risky asks fail closed ([#7427](https://github.com/tutur3u/platform/issues/7427)) ([8b77935](https://github.com/tutur3u/platform/commit/8b779352b34b02e75e24c5174a5c032149fd1683))
* **mastermind:** catch-up section on Today ([#7213](https://github.com/tutur3u/platform/issues/7213)) ([66dba6f](https://github.com/tutur3u/platform/commit/66dba6f107c966110c078b85a4ac999dc51ce11a))
* **mastermind:** gate access on an explicit manage_mastermind grant ([#7158](https://github.com/tutur3u/platform/issues/7158)) ([3a886df](https://github.com/tutur3u/platform/commit/3a886dfca89d496fdaaa91c1d333603016cd364d))
* **mastermind:** grant manage_mastermind to the platform owner ([#7204](https://github.com/tutur3u/platform/issues/7204)) ([976df21](https://github.com/tutur3u/platform/commit/976df21e1711a52e0bed3a6d33a7dbefd7e4afe0))
* **mastermind:** group the Inbox into Urgent, Needs a decision and FYI ([#7412](https://github.com/tutur3u/platform/issues/7412)) ([41fbcc1](https://github.com/tutur3u/platform/commit/41fbcc1a361d1dbc73d09f41e7024a591a562d53))
* **mastermind:** hold one-tap replies for 30 s with undo-all ([#7414](https://github.com/tutur3u/platform/issues/7414)) ([65cfe55](https://github.com/tutur3u/platform/commit/65cfe557bb4bc009c411497fe0a668502eb475ec))
* **mastermind:** scaffold private native Start Worker ([#7301](https://github.com/tutur3u/platform/issues/7301)) ([67b3d6d](https://github.com/tutur3u/platform/commit/67b3d6d42e97aeeaf69f9f3738859288f3dc4071))
* **mastermind:** wire inbox tiers, ?tier=/?q= and undo-all bar ([#7425](https://github.com/tutur3u/platform/issues/7425)) ([2c5a94c](https://github.com/tutur3u/platform/commit/2c5a94c8f67f02b93e0359884cb6d50081ad268e))
* **meet:** add a fenced 365-day transcript retention purge ([#7276](https://github.com/tutur3u/platform/issues/7276)) ([bb0a4e1](https://github.com/tutur3u/platform/commit/bb0a4e18af0a0ebb4cf7b6dbe712e1ce79554420))
* **meet:** add transcription state and consent protocol ([#7266](https://github.com/tutur3u/platform/issues/7266)) ([2d601a1](https://github.com/tutur3u/platform/commit/2d601a1620cc8d39d425abb0617774c6eb2184bf))
* **meet:** default-allow Meet AI with a kill switch ([#7410](https://github.com/tutur3u/platform/issues/7410)) ([a96f160](https://github.com/tutur3u/platform/commit/a96f1609656bed08678af0dd1fb828711af4278a))
* **meet:** draft consent and retention schema for Tess ([#7264](https://github.com/tutur3u/platform/issues/7264)) ([154a9f2](https://github.com/tutur3u/platform/commit/154a9f24703d792c8d8aff1849cdce9a3fc60f6d))
* **meet:** fail-closed per-user Meet AI limiter ([#7417](https://github.com/tutur3u/platform/issues/7417)) ([fca5cb0](https://github.com/tutur3u/platform/commit/fca5cb0b31a5966bab2d8fe16b9d0c8f2f7986fe))
* **meet:** gate Meet AI behind a default-deny workspace allowlist ([#7354](https://github.com/tutur3u/platform/issues/7354)) ([c1ec761](https://github.com/tutur3u/platform/commit/c1ec761dedcdd01041e4b6b82f53aa62f001655f))
* **meet:** improve transcription quality and support solo meetings ([#7267](https://github.com/tutur3u/platform/issues/7267)) ([ecc5e53](https://github.com/tutur3u/platform/commit/ecc5e53bfa6423ddbd9aaf789e6779c551064eab))
* **meet:** inject the abuse-guard service binding ([#6853](https://github.com/tutur3u/platform/issues/6853)) ([5a5e00c](https://github.com/tutur3u/platform/commit/5a5e00cf13cb904ed021159c4cd1f07fb98c26b0))
* **meet:** limit transcript and notes reads to participants and admins ([#7293](https://github.com/tutur3u/platform/issues/7293)) ([ab3216d](https://github.com/tutur3u/platform/commit/ab3216dceaaed5483fa0debd90f091cb9473d06f))
* **mobile:** accessible chart kit for Mastermind insights ([#7040](https://github.com/tutur3u/platform/issues/7040)) ([6118e98](https://github.com/tutur3u/platform/commit/6118e987bd845601f92e4b097460f059550ec03e))
* **mobile:** add Appearance interface styles, density, corners and motion ([#6889](https://github.com/tutur3u/platform/issues/6889)) ([bce582d](https://github.com/tutur3u/platform/commit/bce582dab8db44197ea40d265fca7e89b63ecd08))
* **mobile:** add Education mode and the Today classes card ([#6982](https://github.com/tutur3u/platform/issues/6982)) ([c035dce](https://github.com/tutur3u/platform/commit/c035dce3c3b10686088dfb373a3f36d69194be36))
* **mobile:** add gated read-only Mastermind Threads ([#7171](https://github.com/tutur3u/platform/issues/7171)) ([90f80a2](https://github.com/tutur3u/platform/commit/90f80a2ef141c22eccbcfadf21d8a920c72baca2))
* **mobile:** add Mastermind Work Backlog and Staff segments ([#7110](https://github.com/tutur3u/platform/issues/7110)) ([846f433](https://github.com/tutur3u/platform/commit/846f4337a91966f084ca1178363e8b566d61bc04))
* **mobile:** add read-only Mastermind Machines ([#7227](https://github.com/tutur3u/platform/issues/7227)) ([c753cc1](https://github.com/tutur3u/platform/commit/c753cc19fc6c3c48a5b1f6680ccb1a479095de5e))
* **mobile:** add the Mastermind Decisions journal to the Inbox ([#7134](https://github.com/tutur3u/platform/issues/7134)) ([c793ad2](https://github.com/tutur3u/platform/commit/c793ad2765a2b2e1d7da054debed5d89d46f9260))
* **mobile:** add the Mastermind entry, shell and Home tab ([#7100](https://github.com/tutur3u/platform/issues/7100)) ([c66fa2c](https://github.com/tutur3u/platform/commit/c66fa2ccaba3ed4437c23ee3638f4ce81fda6b9f))
* **mobile:** add the Mastermind Inbox and capability-gated replies ([#7104](https://github.com/tutur3u/platform/issues/7104)) ([6623440](https://github.com/tutur3u/platform/commit/66234407553acd3c38e7be0a650bdb270bb0dc01))
* **mobile:** add the Mastermind Ship and Insights tabs ([#7116](https://github.com/tutur3u/platform/issues/7116)) ([8f6c3cb](https://github.com/tutur3u/platform/commit/8f6c3cbdf83e7be9b6d4b06b1cea19ddd02b5a75))
* **mobile:** add the Mastermind Work tab with lanes and lane detail ([#7106](https://github.com/tutur3u/platform/issues/7106)) ([c5ef891](https://github.com/tutur3u/platform/commit/c5ef8919cdadbc54315095b9239b1401636d9f47))
* **mobile:** answer Mastermind decisions from Home and Inbox ([#7205](https://github.com/tutur3u/platform/issues/7205)) ([595b4bd](https://github.com/tutur3u/platform/commit/595b4bd44ea64074a1e2ccadb8aa1271df278357))
* **mobile:** compact Mastermind Inbox with resolved history ([#7177](https://github.com/tutur3u/platform/issues/7177)) ([4ece677](https://github.com/tutur3u/platform/commit/4ece6778820c2e238856e6425580a888489dba9f))
* **mobile:** compact Mastermind Ship and Insights ([#7175](https://github.com/tutur3u/platform/issues/7175)) ([8091606](https://github.com/tutur3u/platform/commit/809160601ed4786e2b9b86162ebe765cd618a8f6))
* **mobile:** count Focus Time as all task-linked tracked time ([#6922](https://github.com/tutur3u/platform/issues/6922)) ([f6861ba](https://github.com/tutur3u/platform/commit/f6861ba061c807288f58d81c3e042cf979d4f6c0))
* **mobile:** enable the production Mastermind hub for the beta ([#7131](https://github.com/tutur3u/platform/issues/7131)) ([edcc0ed](https://github.com/tutur3u/platform/commit/edcc0ed71c66d4b2581546002277ee8271ac059e))
* **mobile:** full Mastermind decision details ([#7218](https://github.com/tutur3u/platform/issues/7218)) ([9d40f40](https://github.com/tutur3u/platform/commit/9d40f402aefe4fe1c44a085e0c8838dafc1f27fd))
* **mobile:** grouped Mira starters and a You tab with Focus Time and rows ([#6898](https://github.com/tutur3u/platform/issues/6898)) ([d64bbac](https://github.com/tutur3u/platform/commit/d64bbacc324fac5662147d7a0d9892b313ae8caf))
* **mobile:** grouped task detail fields and a device Pomodoro ([#6900](https://github.com/tutur3u/platform/issues/6900)) ([6b0bd0a](https://github.com/tutur3u/platform/commit/6b0bd0ab2888aac5eeea8c4d3382887b29c76f40))
* **mobile:** hardware-backed Iris device key and signer (M0) ([#7364](https://github.com/tutur3u/platform/issues/7364)) ([130e1ed](https://github.com/tutur3u/platform/commit/130e1ed2335678a9990a895baeef357f0886d730))
* **mobile:** Iris chat, ask-card deltas and relay client behind MASTERMIND_IRIS (M0) ([12871a6](https://github.com/tutur3u/platform/commit/12871a6a2f4d49b180a0565c2fb916e7a8128092))
* **mobile:** live Mastermind hub source, disk cache and refresh scheduler (PR2) ([#7086](https://github.com/tutur3u/platform/issues/7086)) ([e566eb9](https://github.com/tutur3u/platform/commit/e566eb9873728fbd0773e4221357e2129d3a076b))
* **mobile:** Mastermind app data foundation and access gate ([#7039](https://github.com/tutur3u/platform/issues/7039)) ([a4f0680](https://github.com/tutur3u/platform/commit/a4f0680818dfbf8b7969577ffdde9feffd95eb9c))
* **mobile:** Mastermind beta polish ([#7123](https://github.com/tutur3u/platform/issues/7123)) ([0e70175](https://github.com/tutur3u/platform/commit/0e70175f2c2ea7bec0a5fd9d736828b430a1e940))
* **mobile:** Mastermind UX foundation and Home redesign ([#7176](https://github.com/tutur3u/platform/issues/7176)) ([ca1a2a7](https://github.com/tutur3u/platform/commit/ca1a2a76dd197aaaed00353cf59383ab8f68f2fe))
* **mobile:** name the root tabs Mira, Inbox and You and add dock search ([#6897](https://github.com/tutur3u/platform/issues/6897)) ([8542531](https://github.com/tutur3u/platform/commit/8542531f21fc114ea6ed2d3461b6233daa12435b))
* **mobile:** open the task menu on Kanban card long-press ([#6937](https://github.com/tutur3u/platform/issues/6937)) ([ff78fca](https://github.com/tutur3u/platform/commit/ff78fca153ac26a27a9245a46445953fd19c45ce))
* **mobile:** rebuild inventory item list with scan and search ([#6976](https://github.com/tutur3u/platform/issues/6976)) ([7870512](https://github.com/tutur3u/platform/commit/787051239f9d5ea503515dd9c284002e31c65f24))
* **mobile:** redesign the board timeline as a day agenda ([#6981](https://github.com/tutur3u/platform/issues/6981)) ([caca4bd](https://github.com/tutur3u/platform/commit/caca4bd84f2e49fab6e579a6748ed86da02329d9))
* **mobile:** redesign the Mastermind decision screen with a shared design system ([#7217](https://github.com/tutur3u/platform/issues/7217)) ([e09c59b](https://github.com/tutur3u/platform/commit/e09c59b963abdd1089943921c809625ac3ad318f))
* **mobile:** redesign the task quick actions sheet ([#6974](https://github.com/tutur3u/platform/issues/6974)) ([cb276a3](https://github.com/tutur3u/platform/commit/cb276a35afdb52e20305aa849ca9823dfa3a9229))
* **mobile:** regroup Home into Today, Up next and Calendar with workspace chips ([#6893](https://github.com/tutur3u/platform/issues/6893)) ([84ea920](https://github.com/tutur3u/platform/commit/84ea9204226fd545ca4acde9ab0c14d9c41dcd09))
* **mobile:** relative Mastermind times with time zone tooltip ([#7223](https://github.com/tutur3u/platform/issues/7223)) ([4e3e9ce](https://github.com/tutur3u/platform/commit/4e3e9cedcc04af307210f68d8fc890a6d5790cee))
* **mobile:** SB-100 L2 app-switcher blur and S3 constant security label ([#7240](https://github.com/tutur3u/platform/issues/7240)) ([94d82f3](https://github.com/tutur3u/platform/commit/94d82f3365ef11c2e0e048d5ec197ad8983ba764))
* **mobile:** set and clear task dates from the quick actions sheet ([#7079](https://github.com/tutur3u/platform/issues/7079)) ([7e59200](https://github.com/tutur3u/platform/commit/7e592002bac648a6c533908ee67b94f2d141b8ae))
* **mobile:** show decisions answered elsewhere ([#7211](https://github.com/tutur3u/platform/issues/7211)) ([2f00366](https://github.com/tutur3u/platform/commit/2f0036634ae4d81588a528cefa433117773a9cd1))
* **mobile:** show every Mastermind decision with lazy loading ([#7221](https://github.com/tutur3u/platform/issues/7221)) ([030231d](https://github.com/tutur3u/platform/commit/030231d8669dbdee94ab40d6ed0896e1295239bc))
* **mobile:** sync Appearance per account with a device override ([#6938](https://github.com/tutur3u/platform/issues/6938)) ([340ef08](https://github.com/tutur3u/platform/commit/340ef08c57fc57d457d464ac60b63e3c42042905))
* **mobile:** telemetry consent prompt and privacy choice ([#7214](https://github.com/tutur3u/platform/issues/7214)) ([63c9d59](https://github.com/tutur3u/platform/commit/63c9d59e6903c47be80bb27a013d7a260307f8db))
* **mobile:** true activity counts and a capped Home for Mastermind ([d2e0996](https://github.com/tutur3u/platform/commit/d2e099645ca43a39f111376f8ce6115b033d823a))
* **ops-hub:** add Mastermind Hub v2 backend ([#6996](https://github.com/tutur3u/platform/issues/6996)) ([9a39228](https://github.com/tutur3u/platform/commit/9a39228b0a18b8be7289957962f610396358cf76))
* **perf:** measure app switches for the one-origin rollout ([#6756](https://github.com/tutur3u/platform/issues/6756)) ([893f041](https://github.com/tutur3u/platform/commit/893f041e9b242a490a5a4abfa5de86adcd574a12))
* **security:** admit attested new definer verified records ([#7329](https://github.com/tutur3u/platform/issues/7329)) ([50edc32](https://github.com/tutur3u/platform/commit/50edc32480396d437418a21ad31dde43eba827a0))
* **storage:** app-side storage access audit log ([#6891](https://github.com/tutur3u/platform/issues/6891)) ([57cc3f1](https://github.com/tutur3u/platform/commit/57cc3f1750a94890f55a9b33496a1694c11c1888))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **time-tracking:** tag Pomodoro sessions and count Focus Time from them ([#6903](https://github.com/tutur3u/platform/issues/6903)) ([783c384](https://github.com/tutur3u/platform/commit/783c38480a786e57aa9a4d70e1bf95b7e18bf19c))
* **tools:** run Tools on TanStack Start + Void through the start bridge ([#7411](https://github.com/tutur3u/platform/issues/7411)) ([41e6ef1](https://github.com/tutur3u/platform/commit/41e6ef14bd87729309104931e761711f7e7b6d33))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
* **tutoring:** add workspace campus list and announcement place picker ([#7049](https://github.com/tutur3u/platform/issues/7049)) ([9ae0a76](https://github.com/tutur3u/platform/commit/9ae0a76828670c29cbdce07638d0213324453a6d))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([5b52e01](https://github.com/tutur3u/platform/commit/5b52e018e1789d47ea2fbab7d85be3a3ec48e4cc))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([9eb14a6](https://github.com/tutur3u/platform/commit/9eb14a6c62076e5f59d5f412a504833e58a81bb6))
* **tutoring:** tutor groups for the policy, teacher picker and queues ([#7054](https://github.com/tutur3u/platform/issues/7054)) ([5298df0](https://github.com/tutur3u/platform/commit/5298df043e186f242d660b018d0003f608ec04a8))
* **utils:** add abuse-guard store protocol and clients ([#6834](https://github.com/tutur3u/platform/issues/6834)) ([22b79b6](https://github.com/tutur3u/platform/commit/22b79b62be0fe486e66f1a0a2420b4b58449bf87))
* **utils:** atomic password reservations on the abuse-guard store ([#6852](https://github.com/tutur3u/platform/issues/6852)) ([bd55672](https://github.com/tutur3u/platform/commit/bd55672054633e8cf6801b24747b63b30d4967dc))
* **utils:** route offline, proxy and replay guards through the abuse-guard store ([#6845](https://github.com/tutur3u/platform/issues/6845)) ([ceb59e3](https://github.com/tutur3u/platform/commit/ceb59e3fc6bbdd3451b2b94cf195c6bbec4077ab))
* **web:** add default-off Start Worker candidate ([#7090](https://github.com/tutur3u/platform/issues/7090)) ([dff8ffc](https://github.com/tutur3u/platform/commit/dff8ffcd9cafaa73f8cfe8555c9470bb439d0b02))
* **web:** add signed Mastermind push-events route ([#7133](https://github.com/tutur3u/platform/issues/7133)) ([8416d3c](https://github.com/tutur3u/platform/commit/8416d3cb54dced26149d0d82316739cd2842fcfa))
* **web:** harden the staging issuer Worker and its protected Next fallback ([#7319](https://github.com/tutur3u/platform/issues/7319)) ([cb5292d](https://github.com/tutur3u/platform/commit/cb5292dc5fc90c10b2af9e9a241905c3c6f5de99))
* **web:** migrate remaining legal pages ([#7107](https://github.com/tutur3u/platform/issues/7107)) ([8a0f947](https://github.com/tutur3u/platform/commit/8a0f9474be2d90311d832c8896a6f95e21b81cbe))
* **web:** prepare dormant Cloudflare cron scheduling ([#7091](https://github.com/tutur3u/platform/issues/7091)) ([5e3f3fe](https://github.com/tutur3u/platform/commit/5e3f3fe2acef63e252260218c2e2b4fe8b2f2204))
* **web:** redesign the download page around one recommended download ([#6941](https://github.com/tutur3u/platform/issues/6941)) ([ef12e37](https://github.com/tutur3u/platform/commit/ef12e37a3f246dd610dc1f6625ea6391d2602536))
* **web:** render Community Guidelines natively in the Start candidate ([#7111](https://github.com/tutur3u/platform/issues/7111)) ([a32548f](https://github.com/tutur3u/platform/commit/a32548f34709465c71e3b432c8f5360341387575))
* **web:** render public legal pages in Start staging candidate ([#7102](https://github.com/tutur3u/platform/issues/7102)) ([7f2f1d7](https://github.com/tutur3u/platform/commit/7f2f1d7923d08751d15b63cacc0a7ee3451f32eb))
* **web:** render security policy and bug bounty in Start candidate ([#7122](https://github.com/tutur3u/platform/issues/7122)) ([77814ea](https://github.com/tutur3u/platform/commit/77814ea0ec520fd8435d8241e0a1ac2110365c65))


### Bug Fixes

* **abuse-guard:** enforce durable command fairness ([#6865](https://github.com/tutur3u/platform/issues/6865)) ([1c44022](https://github.com/tutur3u/platform/commit/1c440227fb512187bb98dddf00b92c7127078e04))
* **abuse-guard:** log invalid budget config once and update the hotspot runbook ([#7247](https://github.com/tutur3u/platform/issues/7247)) ([fb28dd5](https://github.com/tutur3u/platform/commit/fb28dd530aec76ceb6a624a2dcbe2b7d2e9a497a))
* **agent-quota:** deflake concurrent ledger lock admissions ([#7286](https://github.com/tutur3u/platform/issues/7286)) ([b128439](https://github.com/tutur3u/platform/commit/b1284391c9b40179795cb0dc9f9d7a99ede839c0))
* **agent-quota:** treat EPERM on an expired lease as stale ([#7344](https://github.com/tutur3u/platform/issues/7344)) ([c30b400](https://github.com/tutur3u/platform/commit/c30b400ce520967c9e5e926c72f8d32dc6da7fc4))
* **ai:** accept only user and assistant chat input from clients ([#7139](https://github.com/tutur3u/platform/issues/7139)) ([3d6d542](https://github.com/tutur3u/platform/commit/3d6d54204c6b557ecb5a44c05c3e5d5fabf235cd))
* **ai:** align journal observation timer with disconnect ([#7303](https://github.com/tutur3u/platform/issues/7303)) ([0b0adde](https://github.com/tutur3u/platform/commit/0b0addedcb7a9394c72ef1a0c4e12cf5540e62da))
* **ai:** gate meeting transcription on the Meet AI allowlist and fail closed on rate-limit outages ([#7380](https://github.com/tutur3u/platform/issues/7380)) ([f303930](https://github.com/tutur3u/platform/commit/f3039306dfa2459e7c60e6604d9043b1f8b258dc))
* **ai:** read evaluation inputs through one file handle ([#7280](https://github.com/tutur3u/platform/issues/7280)) ([c77068a](https://github.com/tutur3u/platform/commit/c77068a7515a21adfbe1fa42a6586c7113228982))
* **ai:** require workspace access for meeting transcription ([#7357](https://github.com/tutur3u/platform/issues/7357)) ([c2763ae](https://github.com/tutur3u/platform/commit/c2763aeb66c094982c3bf8fa83d5b2da6d5cc3a5))
* **ai:** validate public request admission before workspace lookups ([#7027](https://github.com/tutur3u/platform/issues/7027)) ([c969617](https://github.com/tutur3u/platform/commit/c96961748c672c2ca588c9a499a253a3f58a0f82))
* **ai:** validate public request admission before workspace lookups. ([c969617](https://github.com/tutur3u/platform/commit/c96961748c672c2ca588c9a499a253a3f58a0f82))
* align main unit fixtures with authorization and app inventory ([#7265](https://github.com/tutur3u/platform/issues/7265)) ([0eb1e3a](https://github.com/tutur3u/platform/commit/0eb1e3a8d350c5179bfaad63fc7281bfd47ebbf8))
* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **api:** align export and satellite request boundaries ([#7021](https://github.com/tutur3u/platform/issues/7021)) ([73a876a](https://github.com/tutur3u/platform/commit/73a876aaa7f13eceb13b6e6946e61d8323b1cf10))
* **api:** align user group workspace scoping ([#7001](https://github.com/tutur3u/platform/issues/7001)) ([7c7ec6e](https://github.com/tutur3u/platform/commit/7c7ec6ea248d9a3fdb7aabf9e64fbda1933ad321))
* **api:** align workspace operation permissions and references ([#7033](https://github.com/tutur3u/platform/issues/7033)) ([86c6dd4](https://github.com/tutur3u/platform/commit/86c6dd4dd388a9081334293b0b0005452e846200))
* **api:** regenerate stale retained-routes artifact ([#7101](https://github.com/tutur3u/platform/issues/7101)) ([38f46be](https://github.com/tutur3u/platform/commit/38f46be597a2bd276923298c4bad8d394ac5e7a1))
* **auth:** align cross-app handoff identity ([#7008](https://github.com/tutur3u/platform/issues/7008)) ([e5c30f9](https://github.com/tutur3u/platform/commit/e5c30f95886d20c8cce3a7bad1a9ad7d71a3cb63))
* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** await MFA failure counter writes ([#7368](https://github.com/tutur3u/platform/issues/7368)) ([ff69213](https://github.com/tutur3u/platform/commit/ff69213940eb930fa64f8ea286c61503cde93071))
* **auth:** reject conflicting staging cookie signals ([#7316](https://github.com/tutur3u/platform/issues/7316)) ([bfc41ce](https://github.com/tutur3u/platform/commit/bfc41ce8f329130e077e6440c8424d44fc5e274e))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **auth:** require verified email to link a Microsoft identity ([#7132](https://github.com/tutur3u/platform/issues/7132)) ([d0414bc](https://github.com/tutur3u/platform/commit/d0414bcd93c7997bcdea3fcbfc1efd9ba262d5e4))
* **auth:** restrict Microsoft sign-in to the staff tenant ([#7169](https://github.com/tutur3u/platform/issues/7169)) ([ae20ab4](https://github.com/tutur3u/platform/commit/ae20ab41ffd387a6d0ba45fa8d73d456445283ac))
* **auth:** scope challenge and participant management ([#7026](https://github.com/tutur3u/platform/issues/7026)) ([0991afe](https://github.com/tutur3u/platform/commit/0991afedb1757203fb4d95496e2cc034df6aa4fc))
* **auth:** scope the managed login shortcut to the configured shared cookie domain ([#7051](https://github.com/tutur3u/platform/issues/7051)) ([0f7d9e6](https://github.com/tutur3u/platform/commit/0f7d9e6f0bf96b41b48dd920015c309ff41dee82))
* **billing:** abort deletion when subscription cleanup fails ([#7373](https://github.com/tutur3u/platform/issues/7373)) ([e3ef4d3](https://github.com/tutur3u/platform/commit/e3ef4d31a2a1bc18c15a9e4d6048811afbd226f3))
* **calendar:** fail closed when the staging Tasks URL is unset ([#7345](https://github.com/tutur3u/platform/issues/7345)) ([2f9de15](https://github.com/tutur3u/platform/commit/2f9de15500e89f8228fb9f64cd982d0572b89bbc))
* **calendar:** retire the temporary cutover smoke host and record staging G3 blockers ([#7312](https://github.com/tutur3u/platform/issues/7312)) ([e4a2dc5](https://github.com/tutur3u/platform/commit/e4a2dc53118e2f3a0397fc15665b144d568e7687))
* **calendar:** scope connection PATCH and DELETE to the caller workspace ([#7073](https://github.com/tutur3u/platform/issues/7073)) ([78fc480](https://github.com/tutur3u/platform/commit/78fc480694d6ad14d3706f23d7a8dc93fa1e4641))
* **ci:** accept the post-[#6948](https://github.com/tutur3u/platform/issues/6948) staging producer blob in the production gate ([#6958](https://github.com/tutur3u/platform/issues/6958)) ([8c89a28](https://github.com/tutur3u/platform/commit/8c89a2841f83745c0dd13af973ee6ac388af1774))
* **ci:** admit cf_cli Worker deployment source ([#7308](https://github.com/tutur3u/platform/issues/7308)) ([b81b94f](https://github.com/tutur3u/platform/commit/b81b94f1afdb92ff0a18f9838fe235b375d0aa89))
* **ci:** admit the live cron-control state before the web mode var ([#7290](https://github.com/tutur3u/platform/issues/7290)) ([1f588d7](https://github.com/tutur3u/platform/commit/1f588d792ead80cfc651c3512be6a64928e7c177))
* **ci:** admit the live cron-control state before the web mode var ([#7290](https://github.com/tutur3u/platform/issues/7290)) ([495b02d](https://github.com/tutur3u/platform/commit/495b02d3407239da512151708990e9d626825d52))
* **ci:** align action pin tests and ops hub cache admission ([#7259](https://github.com/tutur3u/platform/issues/7259)) ([021e5b3](https://github.com/tutur3u/platform/commit/021e5b350bae0789257f2d897bc483dc1f493d94))
* **ci:** bound diagnostic redaction and wrapped credential matching ([#6964](https://github.com/tutur3u/platform/issues/6964)) ([14e88a2](https://github.com/tutur3u/platform/commit/14e88a2c200663e1d069b58d02aa26a3722d6701))
* **ci:** classify and admit the contacts and web Start candidates ([#7149](https://github.com/tutur3u/platform/issues/7149)) ([f01edd6](https://github.com/tutur3u/platform/commit/f01edd67e2da0fb396d0730b1892c5cdc124ac01))
* **ci:** consolidate cheap PR checks ([#6956](https://github.com/tutur3u/platform/issues/6956)) ([e70454f](https://github.com/tutur3u/platform/commit/e70454f5622291724804d4ad30c2f52d4b22bb9f))
* **ci:** decouple staging migration markers from Vercel previews ([#6960](https://github.com/tutur3u/platform/issues/6960)) ([b6c69b7](https://github.com/tutur3u/platform/commit/b6c69b7310369993a15e41146018ddc80265c36c))
* **ci:** drop persisted checkout credentials from desktop beta release status ([#7244](https://github.com/tutur3u/platform/issues/7244)) ([f4db822](https://github.com/tutur3u/platform/commit/f4db82246f340cabb5f078334dc29556a5f845a4))
* **ci:** enforce migration policies and PR credential boundaries ([#7034](https://github.com/tutur3u/platform/issues/7034)) ([5921faf](https://github.com/tutur3u/platform/commit/5921faf143b1b11c1bf07a79f9984e7545054dbe))
* **ci:** evaluate desktop beta wildcard expressions ([#6959](https://github.com/tutur3u/platform/issues/6959)) ([b5f5e73](https://github.com/tutur3u/platform/commit/b5f5e731d3f1f24b7ab9c0079ba821138bc945e0))
* **ci:** fit Play release notes into the store budget ([#6957](https://github.com/tutur3u/platform/issues/6957)) ([00558d4](https://github.com/tutur3u/platform/commit/00558d4c689b5494e60c60bf8270172457031de9))
* **ci:** gate tools-cloudflare behind ready-for-ci and classify it ([#7420](https://github.com/tutur3u/platform/issues/7420)) ([963bb2e](https://github.com/tutur3u/platform/commit/963bb2e47caa8b2ab2b0af23ce08b1d30bf1967b))
* **ci:** guard native uploads and disable source maps ([#6972](https://github.com/tutur3u/platform/issues/6972)) ([57a89fe](https://github.com/tutur3u/platform/commit/57a89fec3a0fa83bb21518cf828bb1924aff6ddd))
* **ci:** handle regex literals in staging host guard comment stripper ([#7292](https://github.com/tutur3u/platform/issues/7292)) ([b64c0ac](https://github.com/tutur3u/platform/commit/b64c0acdb12ecbd06e254bf59093f4c914435d1c))
* **ci:** harden Calendar recovery proof and public upload diagnostics ([#6963](https://github.com/tutur3u/platform/issues/6963)) ([efc5c1d](https://github.com/tutur3u/platform/commit/efc5c1d707720f3b4ebe12e0cf19f29d38dd3e6e))
* **ci:** harden wave-1 staging deploy credentials and host checks ([#7369](https://github.com/tutur3u/platform/issues/7369)) ([7107f0d](https://github.com/tutur3u/platform/commit/7107f0d865253e6652041602815d272fee907008))
* **ci:** keep the production service-role key out of pull request jobs ([#6945](https://github.com/tutur3u/platform/issues/6945)) ([946c512](https://github.com/tutur3u/platform/commit/946c512eadbe024c15d1163567b557f61417c987))
* **ci:** locate unit-test result gates by step name ([#7251](https://github.com/tutur3u/platform/issues/7251)) ([bb6573f](https://github.com/tutur3u/platform/commit/bb6573f8f5683890c15166f5a61e2f17140c8422))
* **ci:** prepare native production Workers without routing ([#6939](https://github.com/tutur3u/platform/issues/6939)) ([c548b21](https://github.com/tutur3u/platform/commit/c548b21a4998a6c0dc53874c4e7fa744da920fd2))
* **ci:** record cron-control Wrangler gaps in the usage guard ([#7306](https://github.com/tutur3u/platform/issues/7306)) ([f06027b](https://github.com/tutur3u/platform/commit/f06027bcca904e9e7f564537857a6aa48b3d97a2))
* **ci:** recover open release PR overflow notes and read release gates with the job token ([#6953](https://github.com/tutur3u/platform/issues/6953)) ([5b63bfe](https://github.com/tutur3u/platform/commit/5b63bfe1599e3c58b3259b767a4a282812dd6f0f))
* **ci:** refuse unprotected wave-1 staging environments ([#7409](https://github.com/tutur3u/platform/issues/7409)) ([686b49b](https://github.com/tutur3u/platform/commit/686b49b12cb0ad485b713b8ea680d64a0f83fa37))
* **ci:** repair main Biome, docs, type-check, route inventory and test fixtures ([#7165](https://github.com/tutur3u/platform/issues/7165)) ([082ce3e](https://github.com/tutur3u/platform/commit/082ce3e9d9a8e94d23a15becf174b938a884a181))
* **ci:** require new migrations to sort after the base branch ([#7246](https://github.com/tutur3u/platform/issues/7246)) ([4bf194c](https://github.com/tutur3u/platform/commit/4bf194cd6467e4d3c12458ab60dd47dc8dc7b4d0))
* **ci:** scope Supabase migration credentials to branch-restricted environments ([#6948](https://github.com/tutur3u/platform/issues/6948)) ([12b8f6c](https://github.com/tutur3u/platform/commit/12b8f6c59fa8eeaed0b0520d75f6636791afafd5))
* **ci:** scope the release-please admin token to a branch-restricted environment ([#6949](https://github.com/tutur3u/platform/issues/6949)) ([ca66f98](https://github.com/tutur3u/platform/commit/ca66f9880b4a321a59422772af5260cbdeafcd97))
* **ci:** stabilize native runtime prerequisite downloads ([#7083](https://github.com/tutur3u/platform/issues/7083)) ([5a4edbb](https://github.com/tutur3u/platform/commit/5a4edbb732cfb1b9a82532b9eb3bdfd2d776ea0a))
* **ci:** stop pulling Vercel preview env into the external package build ([#6950](https://github.com/tutur3u/platform/issues/6950)) ([5206f4c](https://github.com/tutur3u/platform/commit/5206f4c40bd60667383c7f1b925a3f33e6e2fdb2))
* **ci:** strip C-style comments only for JS/TS/CSS files in staging host guard ([#7338](https://github.com/tutur3u/platform/issues/7338)) ([4d2d59e](https://github.com/tutur3u/platform/commit/4d2d59eeea224ce5801a86cc64a33e098d8e5075))
* **ci:** use full SQL grant policy for repository acceptance ([#7311](https://github.com/tutur3u/platform/issues/7311)) ([0666c4e](https://github.com/tutur3u/platform/commit/0666c4ed9492d30c8029c590b875bdf4abe17258))
* **cms:** align form and content workspace permissions ([#7023](https://github.com/tutur3u/platform/issues/7023)) ([798d418](https://github.com/tutur3u/platform/commit/798d4189a31e2bacd66c49ce60d21c3b83241411))
* **cms:** restrict external project setup to platform admins ([#7183](https://github.com/tutur3u/platform/issues/7183)) ([3b02a14](https://github.com/tutur3u/platform/commit/3b02a148bfde012df0080234d8a99aa876f6f298))
* **contacts:** GVNN schedule notify teachers, swap race and unsaved-changes guard ([#6966](https://github.com/tutur3u/platform/issues/6966)) ([429bcb3](https://github.com/tutur3u/platform/commit/429bcb30bb03f082c523e8f06c5f3b8c493ac2f4))
* **contacts:** restore proxied topic APIs and schedule navigation ([#6967](https://github.com/tutur3u/platform/issues/6967)) ([ef0f982](https://github.com/tutur3u/platform/commit/ef0f982a50a67beaf95e32375ced01eeae2f67dc))
* **contacts:** sweep stale schedule claims first and pin the exact-status claim ([#6988](https://github.com/tutur3u/platform/issues/6988)) ([f31b18c](https://github.com/tutur3u/platform/commit/f31b18c740d7ebccd93e2f214a5d26defcae2803))
* **cron-control:** admit unchanged dashboard deployment ([#7300](https://github.com/tutur3u/platform/issues/7300)) ([aed3c71](https://github.com/tutur3u/platform/commit/aed3c71e64a09d7cba6eb5ae89cdfaa1b6357b7b))
* **cron-control:** admit unchanged dashboard deployment ([#7300](https://github.com/tutur3u/platform/issues/7300)) ([199c1d8](https://github.com/tutur3u/platform/commit/199c1d868083008fdf7823285299c5325ebd2398))
* **cron-control:** verify cron sets independent of order ([#7304](https://github.com/tutur3u/platform/issues/7304)) ([39dc633](https://github.com/tutur3u/platform/commit/39dc6330e0ff24a0605c4427f4144d476873483b))
* **cron-control:** verify cron sets independent of order ([#7304](https://github.com/tutur3u/platform/issues/7304)) ([b6d9748](https://github.com/tutur3u/platform/commit/b6d9748137ac99c0b1dea3971756cf34fbb0b929))
* **database:** add caller checks to privileged reporting functions ([#7080](https://github.com/tutur3u/platform/issues/7080)) ([877bb82](https://github.com/tutur3u/platform/commit/877bb82dfb20dd5ea5a3cdc68256f230a63e457c))
* **database:** add membership migration rollbacks (UT-062) ([#7359](https://github.com/tutur3u/platform/issues/7359)) ([45f58a3](https://github.com/tutur3u/platform/commit/45f58a3541de81c4254c41d6b725a42625b6dffc))
* **database:** align AI chat and subscription RPC access ([#7035](https://github.com/tutur3u/platform/issues/7035)) ([9fd1c02](https://github.com/tutur3u/platform/commit/9fd1c021c78467bf692ea759fb8fd48664ed181b))
* **database:** align time-tracking and task RPC permissions ([#7000](https://github.com/tutur3u/platform/issues/7000)) ([6730c79](https://github.com/tutur3u/platform/commit/6730c798f17be276dc3f1fe8efd60306a84b66f3))
* **database:** align workspace merge phase permissions ([#7002](https://github.com/tutur3u/platform/issues/7002)) ([fa47e8d](https://github.com/tutur3u/platform/commit/fa47e8d24c03633e3dbee9f6ccb7d2f9540e3a8e))
* **database:** cascade workspace-owned documents, logs and team memberships ([#6977](https://github.com/tutur3u/platform/issues/6977)) ([12cc8ad](https://github.com/tutur3u/platform/commit/12cc8adfc6aa963efee1e6cc0e2ec299a1cca8d8))
* **database:** harden session management function guards ([#6993](https://github.com/tutur3u/platform/issues/6993)) ([fb921f4](https://github.com/tutur3u/platform/commit/fb921f4f2f102070da9eaaae63629b86c23ca21c))
* **database:** pin notification trigger host and use Vault bearer (SR-327) ([#7113](https://github.com/tutur3u/platform/issues/7113)) ([1c8fdf9](https://github.com/tutur3u/platform/commit/1c8fdf9c9fdd85824f31d1fe562bb9b3c001f4dd))
* **database:** quarantine orphan workspace role permissions before composite FK ([#7358](https://github.com/tutur3u/platform/issues/7358)) ([df66187](https://github.com/tutur3u/platform/commit/df6618727522e2ed7402fdac3b2ddfd80042d0b7))
* **database:** restate employee runtime readiness ACL ([#7231](https://github.com/tutur3u/platform/issues/7231)) ([0047e77](https://github.com/tutur3u/platform/commit/0047e77296c6609401bd07de1fd12f4712568aaf))
* **database:** restore employee readiness and whiteboard payload contracts ([#7189](https://github.com/tutur3u/platform/issues/7189)) ([4666c9c](https://github.com/tutur3u/platform/commit/4666c9c9eec6fed461042bdabc272b0152a075e6))
* **database:** restrict an RPC to the service role ([#7059](https://github.com/tutur3u/platform/issues/7059)) ([4fb4eef](https://github.com/tutur3u/platform/commit/4fb4eef4533f0ca3e654fa5681f91d6010d22d7d))
* **database:** restrict audit and legacy token privileges ([#7112](https://github.com/tutur3u/platform/issues/7112)) ([e6b4c45](https://github.com/tutur3u/platform/commit/e6b4c452c3f2cfc85e38dd18f1ffd0dcabe4d929))
* **database:** restrict remaining privileged definer functions ([#7092](https://github.com/tutur3u/platform/issues/7092)) ([5743c29](https://github.com/tutur3u/platform/commit/5743c290cfccc7c9250f1c9e6027c3318482df74))
* **database:** restrict two internal merge helpers to the service role ([#7069](https://github.com/tutur3u/platform/issues/7069)) ([291bb02](https://github.com/tutur3u/platform/commit/291bb02f9be4a7624a7f525e034ba02b0660df3c))
* **database:** restrict workspace user link repair to the service role ([#6994](https://github.com/tutur3u/platform/issues/6994)) ([debface](https://github.com/tutur3u/platform/commit/debface3d868d9207a4568774c88e0ae7f31bd3d))
* **database:** scope Discord mappings to the linked workspace ([#7014](https://github.com/tutur3u/platform/issues/7014)) ([cc59d0b](https://github.com/tutur3u/platform/commit/cc59d0ba1527509297ec18ac6a1d559991f1fe64))
* **database:** scope public function execution privileges ([#7076](https://github.com/tutur3u/platform/issues/7076)) ([c2e1d7e](https://github.com/tutur3u/platform/commit/c2e1d7ed0287a719c7052967372cc77ee9acd436))
* **database:** scope time request detail references ([#7024](https://github.com/tutur3u/platform/issues/7024)) ([c7fb9f5](https://github.com/tutur3u/platform/commit/c7fb9f523e612c3522460d6edcae98cbb2a3550c))
* **database:** tighten table privileges ([#7197](https://github.com/tutur3u/platform/issues/7197)) ([a43d2c3](https://github.com/tutur3u/platform/commit/a43d2c3d159bcaca6e1716781750d2cdd0135e88))
* **db:** consolidate has_workspace_permission and add manage_mastermind ([#7302](https://github.com/tutur3u/platform/issues/7302)) ([29ef37b](https://github.com/tutur3u/platform/commit/29ef37bf1f47571ade70b0ab3ba879554fa5aa79))
* **db:** guard task cycle links to the cycle workspace ([#6942](https://github.com/tutur3u/platform/issues/6942)) ([54bf36e](https://github.com/tutur3u/platform/commit/54bf36edfff49ffed85957f3f8ceb3260099aeb7))
* **db:** pin merge batch helper definer search_path ([#7282](https://github.com/tutur3u/platform/issues/7282)) ([61d03a8](https://github.com/tutur3u/platform/commit/61d03a8d784558a73889c296a107350015977194))
* **db:** pin time tracking definer search_path and fix linked-request rejection ([#7281](https://github.com/tutur3u/platform/issues/7281)) ([51bb558](https://github.com/tutur3u/platform/commit/51bb55860abbc4900cef61342e8862b97e2f4c72))
* **db:** pin workspace ownership in row policies ([#7136](https://github.com/tutur3u/platform/issues/7136)) ([232181a](https://github.com/tutur3u/platform/commit/232181a6f78f0bf4cb1ddc0cadc0427082163464))
* **db:** protect workspace ownership changes ([#7184](https://github.com/tutur3u/platform/issues/7184)) ([123271e](https://github.com/tutur3u/platform/commit/123271e7d757f0f4c2a335153a92bab7535c8241))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **db:** scope workspace invites to their workspace ([#7137](https://github.com/tutur3u/platform/issues/7137)) ([9cde8ca](https://github.com/tutur3u/platform/commit/9cde8ca40fdcb86fa1cb49dd8f638ff8427fde24))
* **db:** tighten storage insert policies and audit function search_path ([#7356](https://github.com/tutur3u/platform/issues/7356)) ([17a0b2a](https://github.com/tutur3u/platform/commit/17a0b2a0d4b1b077a40e8ce3c1b9fba1bdfad735))
* **db:** tighten workspace ownership change paths ([#7194](https://github.com/tutur3u/platform/issues/7194)) ([b099b73](https://github.com/tutur3u/platform/commit/b099b7303ea29ad9f39df90dfc99352e96b821e4))
* **db:** verify staff identity in domain-gated policies ([#7138](https://github.com/tutur3u/platform/issues/7138)) ([c4593fb](https://github.com/tutur3u/platform/commit/c4593fb27c8aeac4e757235fcdc36fbaf9d5d5a9))
* **desktop:** publish run-free desktop versions with structured release notes ([#7157](https://github.com/tutur3u/platform/issues/7157)) ([90643d7](https://github.com/tutur3u/platform/commit/90643d747d01672e6f3a8ccc348f26aed0586d5c))
* **docs:** escape &lt;option&gt; placeholder in Mastermind decision detail ([#7236](https://github.com/tutur3u/platform/issues/7236)) ([64e660f](https://github.com/tutur3u/platform/commit/64e660f6c5146908696a6eeac5f6671aa69b0ea0))
* **drive:** expire and revoke export links ([#7140](https://github.com/tutur3u/platform/issues/7140)) ([307f08f](https://github.com/tutur3u/platform/commit/307f08fee6ded7b19fe61901390afa45c33d5dce))
* **e2e:** collect Playwright specs and keep shared localhost sessions ([#7163](https://github.com/tutur3u/platform/issues/7163)) ([35b2963](https://github.com/tutur3u/platform/commit/35b2963c77ddc5207f6fa778f9d40dc997af2a50))
* **education:** scope learner and teacher resource access ([#7017](https://github.com/tutur3u/platform/issues/7017)) ([5942601](https://github.com/tutur3u/platform/commit/59426011aafb60ec51da42f6feb95872834acc60))
* **education:** validate test courses and quiz destinations ([#7020](https://github.com/tutur3u/platform/issues/7020)) ([8535738](https://github.com/tutur3u/platform/commit/8535738863df43f37c64eb8348a9a02377b6308a))
* **finance:** align database workspace boundaries ([#7031](https://github.com/tutur3u/platform/issues/7031)) ([01dbc5b](https://github.com/tutur3u/platform/commit/01dbc5b5f2ddc487e6f239888683026323ad48e7))
* **finance:** align workspace scoping for finance routes ([#7029](https://github.com/tutur3u/platform/issues/7029)) ([2ba27b9](https://github.com/tutur3u/platform/commit/2ba27b96035bbd43288b6c3de1e9ca9909b9243a))
* **finance:** require authorized callers for finance read RPCs ([#7003](https://github.com/tutur3u/platform/issues/7003)) ([90d5fe4](https://github.com/tutur3u/platform/commit/90d5fe4e6aa83a565e9b4965d97a54b624ed5518))
* **finance:** restrict legacy finance chart and migration RPCs ([#7006](https://github.com/tutur3u/platform/issues/7006)) ([626ef83](https://github.com/tutur3u/platform/commit/626ef837b37b1af7cf5c576f261b40a939a4b418))
* **finance:** retire the wallet migration writer ([#7126](https://github.com/tutur3u/platform/issues/7126)) ([0ef3673](https://github.com/tutur3u/platform/commit/0ef3673546e17264c2e0edfba413f005a182416c))
* **finance:** scope categories and transaction access to the workspace ([#7150](https://github.com/tutur3u/platform/issues/7150)) ([f08c4ea](https://github.com/tutur3u/platform/commit/f08c4ead35be9b81465de2505121de003285f651))
* **finance:** seed exchange rates in-process ([#7371](https://github.com/tutur3u/platform/issues/7371)) ([440cbef](https://github.com/tutur3u/platform/commit/440cbefc2194b86c817279ba4f8ec8d3dea8e8f5))
* **forms:** align definition and media workspace access ([#7015](https://github.com/tutur3u/platform/issues/7015)) ([98a5757](https://github.com/tutur3u/platform/commit/98a57572ce4e99b3b5240245c1577875a85de88b))
* **forms:** scope share-link lookup to the resolved workspace ([#7065](https://github.com/tutur3u/platform/issues/7065)) ([869062d](https://github.com/tutur3u/platform/commit/869062d27200a075ba1afe112c0ae0ca2ac05661))
* **groups:** align group and member access checks ([#7028](https://github.com/tutur3u/platform/issues/7028)) ([6fa6453](https://github.com/tutur3u/platform/commit/6fa6453a9b76559fdac74fe6727c71348b090307))
* **infra:** align platform administration permissions ([#7011](https://github.com/tutur3u/platform/issues/7011)) ([18d30ec](https://github.com/tutur3u/platform/commit/18d30ec1204fcd89d7abc8cb463043331330f33d))
* **infra:** guard the managed cron secret in the database ([#7190](https://github.com/tutur3u/platform/issues/7190)) ([300ad76](https://github.com/tutur3u/platform/commit/300ad76390bff5712ba97b57980ec2a28caea345))
* **infra:** require platform admin for workspace secrets ([#7174](https://github.com/tutur3u/platform/issues/7174)) ([496de2e](https://github.com/tutur3u/platform/commit/496de2ef9c819ec73e647e395e80f494a3c696c9))
* **infra:** require verified staff identity for managed cron toggles ([#7181](https://github.com/tutur3u/platform/issues/7181)) ([714983a](https://github.com/tutur3u/platform/commit/714983a56d7672bf221d72841c211fa4dd3c5d63))
* **infrastructure:** align secret and role permission access ([#7013](https://github.com/tutur3u/platform/issues/7013)) ([4917e16](https://github.com/tutur3u/platform/commit/4917e16567f3b348ace0159d6cc982be50b9a8b7))
* **integrations:** align AI and project request authorization ([#7012](https://github.com/tutur3u/platform/issues/7012)) ([606e882](https://github.com/tutur3u/platform/commit/606e882bb3c44f39eb7277f4a9701acc492a025b))
* **inventory:** align product stock routes with adjust-stock permission model ([#7063](https://github.com/tutur3u/platform/issues/7063)) ([68d5c5f](https://github.com/tutur3u/platform/commit/68d5c5f769a8011ce5cb297b2af8130193d3cfa4))
* **inventory:** remove stale server logger fixture ([#6954](https://github.com/tutur3u/platform/issues/6954)) ([eb8842b](https://github.com/tutur3u/platform/commit/eb8842ba190f0603eedbbc9a9aa26e06203e92f2))
* **inventory:** resolve product export test path relative to file ([#6965](https://github.com/tutur3u/platform/issues/6965)) ([1bdb508](https://github.com/tutur3u/platform/commit/1bdb508a97e56885660c59fdd6b32fed45e9c47f))
* **inventory:** type existing stock rows for route comparisons ([#7230](https://github.com/tutur3u/platform/issues/7230)) ([8f5fa7f](https://github.com/tutur3u/platform/commit/8f5fa7f2884642cd7c254d21e9e9a14dd22f1cb9))
* **learn:** require parent consent for Tulearn parent links (SR-238) ([#7062](https://github.com/tutur3u/platform/issues/7062)) ([b085a0e](https://github.com/tutur3u/platform/commit/b085a0e331aa758fd1e8f490df284b6bf22ed63a))
* **learn:** use typed clients for parent consent helpers ([#7252](https://github.com/tutur3u/platform/issues/7252)) ([d64dc27](https://github.com/tutur3u/platform/commit/d64dc2728e57220415fe5dcf6e2101c717fdbe8f))
* **legal:** keep safety rules in the proposed AUP and community policies ([#7226](https://github.com/tutur3u/platform/issues/7226)) ([8ffeeef](https://github.com/tutur3u/platform/commit/8ffeeef8bc996b1997a46047e322f86885438c6c))
* **legal:** restore the in-force legal documents and separate proposed changes ([#7220](https://github.com/tutur3u/platform/issues/7220)) ([e035fa9](https://github.com/tutur3u/platform/commit/e035fa9c54d79b7766cd8d4c053b2f739d4d0ff4))
* **legal:** restore the in-force legal documents and separate proposed changes ([#7220](https://github.com/tutur3u/platform/issues/7220)) ([aba1e25](https://github.com/tutur3u/platform/commit/aba1e250d7bcd08ae2ead0417e6816f8c97d2ae6))
* **lint:** clear remaining Biome useTemplate infos on main ([#7237](https://github.com/tutur3u/platform/issues/7237)) ([1ce93ac](https://github.com/tutur3u/platform/commit/1ce93ac22174394f039083322b6be89c49ba3fc2))
* **mastermind:** apply Biome template-literal rewrites to the native tests ([#7330](https://github.com/tutur3u/platform/issues/7330)) ([7792edc](https://github.com/tutur3u/platform/commit/7792edc8839b2c1a5a462cbd4b0c4dc2dbe9f13c))
* **mastermind:** filter explicit grants from CMS team role writes ([#7248](https://github.com/tutur3u/platform/issues/7248)) ([3565ab7](https://github.com/tutur3u/platform/commit/3565ab7988c60228ca78dd12eaa953f8c77fef04))
* **mastermind:** persist mobile replies during undo ([#7208](https://github.com/tutur3u/platform/issues/7208)) ([1c1411d](https://github.com/tutur3u/platform/commit/1c1411dc46fe1f8f61580bece789ec96b28eacc1))
* **mastermind:** preserve push success receipts across deadlines ([#7152](https://github.com/tutur3u/platform/issues/7152)) ([dfc58c5](https://github.com/tutur3u/platform/commit/dfc58c5d7407b1943de80d0b3bfa727656342447))
* **meet:** admit AI credits before reserving transcript chunks ([#7243](https://github.com/tutur3u/platform/issues/7243)) ([0826b0e](https://github.com/tutur3u/platform/commit/0826b0eeee62421c284f1edfb9e4454bb2d1d526))
* **meet:** align guest and poll plan access ([#7010](https://github.com/tutur3u/platform/issues/7010)) ([3848203](https://github.com/tutur3u/platform/commit/38482031cb31370266617da264d71bea61a48acb))
* **meet:** apply anonymous plan access to guest availability writes ([#7064](https://github.com/tutur3u/platform/issues/7064)) ([019d52d](https://github.com/tutur3u/platform/commit/019d52d2f27f2c37c96ca967ff9edc56d12e00c8))
* **meet:** apply anonymous plan access to guest availability writes. ([019d52d](https://github.com/tutur3u/platform/commit/019d52d2f27f2c37c96ca967ff9edc56d12e00c8))
* **meet:** bill Meet AI to the meeting workspace's AI credits ([#7408](https://github.com/tutur3u/platform/issues/7408)) ([0f8b6dc](https://github.com/tutur3u/platform/commit/0f8b6dcac84f7b29d4c6a15e574330d7b3ad4349))
* **meet:** preserve host identity and transcript access ([#7030](https://github.com/tutur3u/platform/issues/7030)) ([3753d70](https://github.com/tutur3u/platform/commit/3753d7060ace891269187a7972d4a460148905af))
* **meet:** tighten legacy meeting and recording access ([#7270](https://github.com/tutur3u/platform/issues/7270)) ([08c55af](https://github.com/tutur3u/platform/commit/08c55af1c43bb9354e38aa6bda875e939f8c1003))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **members:** normalize targets before access changes ([#7005](https://github.com/tutur3u/platform/issues/7005)) ([9d870f6](https://github.com/tutur3u/platform/commit/9d870f62769d8941695eff1ca07d68714abc171a))
* **mobile:** accept CDN-weakened ETags from the Mastermind hub ([#7156](https://github.com/tutur3u/platform/issues/7156)) ([3837c57](https://github.com/tutur3u/platform/commit/3837c571b7db63e9f8846e49c775399a15186a11))
* **mobile:** accept release and quota field envelopes ([f1fb5f4](https://github.com/tutur3u/platform/commit/f1fb5f4cf87e534769f62bd1088ab960e2f78f47))
* **mobile:** annotate usage gaps and retain hub status reasons ([256ae3f](https://github.com/tutur3u/platform/commit/256ae3f6a3b48d66291acd7d70646aeab3e6dc07))
* **mobile:** bound store metadata retries and lookup deadline ([#6961](https://github.com/tutur3u/platform/issues/6961)) ([6196331](https://github.com/tutur3u/platform/commit/6196331a96c9def7a7ca24a0a362cae70f09d9ff))
* **mobile:** close the persisted telemetry-enable gap and add the iOS privacy manifest ([#7294](https://github.com/tutur3u/platform/issues/7294)) ([99e3b92](https://github.com/tutur3u/platform/commit/99e3b92c4bebde248509c44f8c1b432c0ba89750))
* **mobile:** complete pull-to-refresh across remote lists ([#6980](https://github.com/tutur3u/platform/issues/6980)) ([1fef0b9](https://github.com/tutur3u/platform/commit/1fef0b99603e3ba1395c38869e52753342602d18))
* **mobile:** consume Forge companion fields and verify publisher fixture ([41caf51](https://github.com/tutur3u/platform/commit/41caf5177023e67302e003126946c18f7e633d5d))
* **mobile:** correct Mastermind Home freshness and accessible controls ([4bcf709](https://github.com/tutur3u/platform/commit/4bcf70910140da69840d0e728d7ee6e611a60106))
* **mobile:** harden Mastermind hub snapshot parsing ([#7173](https://github.com/tutur3u/platform/issues/7173)) ([b27e563](https://github.com/tutur3u/platform/commit/b27e563ccf0b52c9e84566dc5238b1ced846a244))
* **mobile:** harden release URLs, keychain class, backups and PKCE storage ([#7124](https://github.com/tutur3u/platform/issues/7124)) ([d947c18](https://github.com/tutur3u/platform/commit/d947c18d44abb936c237d7c21cdb5f15b1833005))
* **mobile:** harden secure storage adoption and session retries ([#7167](https://github.com/tutur3u/platform/issues/7167)) ([26118b8](https://github.com/tutur3u/platform/commit/26118b8b87014bb83cda0b7ad3d295183897908b))
* **mobile:** harden task-row swipes, roll back failed edits, add Start focus ([#6886](https://github.com/tutur3u/platform/issues/6886)) ([f2ab16a](https://github.com/tutur3u/platform/commit/f2ab16a81b6b122af81a075c77ec9550e168693a))
* **mobile:** keep Mastermind count tiles tappable via semantics and ignore misdated fleet points ([c05d993](https://github.com/tutur3u/platform/commit/c05d99382bc45470113fb8938a6b0cf8b4e2184f))
* **mobile:** keep unreadable Mastermind quotas visible ([#7310](https://github.com/tutur3u/platform/issues/7310)) ([9b8eaf7](https://github.com/tutur3u/platform/commit/9b8eaf72810de3c3e7fe43fe707511fe93e76f86))
* **mobile:** let Mastermind tile labels wrap instead of truncating ([08076c5](https://github.com/tutur3u/platform/commit/08076c57b629b0b4a104b01da37ddd213efb372e))
* **mobile:** make external TestFlight distribution opt-in ([#7326](https://github.com/tutur3u/platform/issues/7326)) ([538b8ff](https://github.com/tutur3u/platform/commit/538b8ff1894ce06932eb7930ffc8e42c1aa1b28c))
* **mobile:** manage workspace visibility and filter Home choices ([#6978](https://github.com/tutur3u/platform/issues/6978)) ([8d625ae](https://github.com/tutur3u/platform/commit/8d625ae0a791b16db681a9ce238c66d0a8194003))
* **mobile:** migrate device storage and recover duplicate sessions ([884c9bc](https://github.com/tutur3u/platform/commit/884c9bcd20a017d42f9c955963e8d5bfaa2da483))
* **mobile:** one search action, centred Mira prompt, Profile edit button and count-chip cleanup ([#6973](https://github.com/tutur3u/platform/issues/6973)) ([7b74bb1](https://github.com/tutur3u/platform/commit/7b74bb11409df047a1e5fbac5d79e785909cb12d))
* **mobile:** preserve running timers and focus session recovery ([8c550d7](https://github.com/tutur3u/platform/commit/8c550d76c311c54c6139e957234f0d7b757729f3))
* **mobile:** preserve sessions during keychain duplicate retries ([744c09a](https://github.com/tutur3u/platform/commit/744c09a88ab81c0d37b362740c587ff80807fb8c))
* **mobile:** prevent task estimation crashes ([#6971](https://github.com/tutur3u/platform/issues/6971)) ([bae4818](https://github.com/tutur3u/platform/commit/bae48188780882f496a7838648708f049f1c58f4))
* **mobile:** prioritize staged sessions during recovery ([7ad2b2e](https://github.com/tutur3u/platform/commit/7ad2b2e938c2516add26c911ee4828b3ffbd1f03))
* **mobile:** reconcile Mastermind decisions and explain missing data ([eae3a0c](https://github.com/tutur3u/platform/commit/eae3a0c97b5955e70268d3a165a771f589bb5f55))
* **mobile:** register push tokens only after notification permission ([#7277](https://github.com/tutur3u/platform/issues/7277)) ([b967fc7](https://github.com/tutur3u/platform/commit/b967fc7cb56c569c9d60f7c1af331da4ffc0751e))
* **mobile:** replace stale staged sessions before persisting ([e089770](https://github.com/tutur3u/platform/commit/e0897701128aadefc406dd28a2fa8e1c575d423c))
* **mobile:** restore missing pacing glyph and align reason assertions ([6aae2d6](https://github.com/tutur3u/platform/commit/6aae2d66807a245124605437a6dd4b083a50bbfc))
* **mobile:** route Mira attachments on a held chat through New chat ([#7077](https://github.com/tutur3u/platform/issues/7077)) ([d607e95](https://github.com/tutur3u/platform/commit/d607e952e72b454a5c414b6e84576201d47d9bc1))
* **mobile:** route Mira attachments on a held chat through New chat. ([d607e95](https://github.com/tutur3u/platform/commit/d607e952e72b454a5c414b6e84576201d47d9bc1))
* **mobile:** serialize pinned workspace saves behind security checks ([#7074](https://github.com/tutur3u/platform/issues/7074)) ([4e2dc62](https://github.com/tutur3u/platform/commit/4e2dc62d67b40a60b35d5122e1bd423540370dc2))
* **mobile:** skip unreachable TestFlight sources in release history ([#7141](https://github.com/tutur3u/platform/issues/7141)) ([cd0f46c](https://github.com/tutur3u/platform/commit/cd0f46cba38aa01acdf780b0e421c93a7b29b7e7))
* **mobile:** stack mastermind segments instead of scrolling at large text ([85959dd](https://github.com/tutur3u/platform/commit/85959ddda4d86bdc311d2fa0f026a4e092197661))
* **mobile:** stop Mira chat scroll teleport and clear the composer on send ([#6734](https://github.com/tutur3u/platform/issues/6734)) ([e3c0770](https://github.com/tutur3u/platform/commit/e3c07706c3b30d229548a1ffa0e179c95d5aa89e))
* **mobile:** tolerate hub additions and preserve dock clearance ([ada4823](https://github.com/tutur3u/platform/commit/ada4823ccf962a50078a6de3a0f74dc1208d8a97))
* **mobile:** upload Mira attachments into the selected chat's store ([#6724](https://github.com/tutur3u/platform/issues/6724)) ([2109920](https://github.com/tutur3u/platform/commit/21099205486b88ca5aa9562071eab3e04dd7877b))
* **mobile:** wait for quick-action mutations to finish ([#7322](https://github.com/tutur3u/platform/issues/7322)) ([7a9a2c2](https://github.com/tutur3u/platform/commit/7a9a2c223be2e650be76727066c76e269f1fc211))
* **onboarding:** derive the user from the session ([#7374](https://github.com/tutur3u/platform/issues/7374)) ([e281b83](https://github.com/tutur3u/platform/commit/e281b83f88c557764e02963e0c5ae7a33b229c42))
* **packages:** make the published [@tuturuuu](https://github.com/tuturuuu) chain installable and guard it ([#7389](https://github.com/tutur3u/platform/issues/7389)) ([b1378ab](https://github.com/tutur3u/platform/commit/b1378abcaa31c02b5861cc16e6aa6bb2f8789c3c))
* **permissions:** keep role workspace ownership consistent ([#7206](https://github.com/tutur3u/platform/issues/7206)) ([bcd7671](https://github.com/tutur3u/platform/commit/bcd76715785fb17e703e934c3e2b36e672222647))
* **playground:** require a signed-in staff session for AI routes and pages ([#7215](https://github.com/tutur3u/platform/issues/7215)) ([e4e42e0](https://github.com/tutur3u/platform/commit/e4e42e06ca651b9838e06248f9ad4add952768d0))
* **reports:** monthly report summary counts on first load ([#7527](https://github.com/tutur3u/platform/issues/7527)) ([72d124e](https://github.com/tutur3u/platform/commit/72d124ebf98fc35d91a902c8be4787216c0803ae))
* restore main type check (meet fixture, track request routes) ([#7232](https://github.com/tutur3u/platform/issues/7232)) ([4fa1436](https://github.com/tutur3u/platform/commit/4fa143673a92161f31b4c300f774ebcbbdef468f))
* **roles:** scope role permission updates to the role's workspace ([#6995](https://github.com/tutur3u/platform/issues/6995)) ([010f0f2](https://github.com/tutur3u/platform/commit/010f0f228acf8acbb095f2a6020eac414deac5d6))
* **sdk:** approve storage export links portable source ([#7154](https://github.com/tutur3u/platform/issues/7154)) ([8b60602](https://github.com/tutur3u/platform/commit/8b60602fd58b894a6bc5af3db8920676da1183ec))
* **security:** harden staging-host guard and restore reserved-host handling ([#7256](https://github.com/tutur3u/platform/issues/7256)) ([077e48c](https://github.com/tutur3u/platform/commit/077e48c3ecea2841d4c99c9d848122ef1827dd42))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **security:** stop trusting the expired rewise.me origin ([#7413](https://github.com/tutur3u/platform/issues/7413)) ([c8f3530](https://github.com/tutur3u/platform/commit/c8f3530fee7bdaa3a86fc23caaafa23112955ee0))
* **security:** validate project branches and strip guard comments ([#7271](https://github.com/tutur3u/platform/issues/7271)) ([d718355](https://github.com/tutur3u/platform/commit/d718355c2d86bb875e835326f7744b9832673839))
* **staging:** use canonical web session issuer ([#7313](https://github.com/tutur3u/platform/issues/7313)) ([7244666](https://github.com/tutur3u/platform/commit/72446666a4d71e59f4e79da3a9440a15128233fa))
* **storage:** match Drive private roots case-insensitively ([#7084](https://github.com/tutur3u/platform/issues/7084)) ([85b61bb](https://github.com/tutur3u/platform/commit/85b61bb064adb66876fd9e993b8e8f0617fa5f25))
* **storage:** own upload budget for workspace-managed user avatars ([#7289](https://github.com/tutur3u/platform/issues/7289)) ([25f6903](https://github.com/tutur3u/platform/commit/25f69034808c5aaf26493b9c27cc2f9fe3f75087))
* **tasks:** align board access and realtime delivery ([#7016](https://github.com/tutur3u/platform/issues/7016)) ([70aef15](https://github.com/tutur3u/platform/commit/70aef1546bf600aaa29fc046a915fc7c69be4d02))
* **tasks:** complete guest board test auth fixture ([#7225](https://github.com/tutur3u/platform/issues/7225)) ([84827c6](https://github.com/tutur3u/platform/commit/84827c6b492c81a942fca43ca2ab170890f0b554))
* **tasks:** restrict task list writes to authorized members ([#7125](https://github.com/tutur3u/platform/issues/7125)) ([f6d616f](https://github.com/tutur3u/platform/commit/f6d616f14bdbd76a215bca76fdfcda995cf356e8))
* **tasks:** scope board capacity rules and public-link writes (SR-229) ([#7060](https://github.com/tutur3u/platform/issues/7060)) ([cda3344](https://github.com/tutur3u/platform/commit/cda3344e084e4f95a7a2d66aab3817d93104518e))
* **teach:** enforce page-level workspace membership ([#7098](https://github.com/tutur3u/platform/issues/7098)) ([77f5869](https://github.com/tutur3u/platform/commit/77f58694876e8320dcf38789f4b0ba2c5725589a))
* **teach:** scope module pages to the workspace (F8) ([#7082](https://github.com/tutur3u/platform/issues/7082)) ([7925a33](https://github.com/tutur3u/platform/commit/7925a33d05070f6eea74adacc1dd728b301df31d))
* **teach:** scope quiz set and module reads to the route workspace ([#7078](https://github.com/tutur3u/platform/issues/7078)) ([4be48e4](https://github.com/tutur3u/platform/commit/4be48e41cf255f59f06586b069102cc52b015a1c))
* **teach:** scope quiz-set module link to the route workspace ([#7067](https://github.com/tutur3u/platform/issues/7067)) ([2a7cefb](https://github.com/tutur3u/platform/commit/2a7cefbe3911e75077bdc9e6659df479097184f4))
* **time-tracking:** bound tagged stats, refuse tags on manual entries, migrate legacy Pomodoro state ([#6905](https://github.com/tutur3u/platform/issues/6905)) ([a4ecda3](https://github.com/tutur3u/platform/commit/a4ecda3b69c763430ef59ea98674306383e31ffa))
* **time-tracking:** validate request task, category and linked-session scope ([#7068](https://github.com/tutur3u/platform/issues/7068)) ([716b49f](https://github.com/tutur3u/platform/commit/716b49f97999af4df1f20cc97214385e6e3f4f7d))
* **tooling:** resolve staging host Biome lint diagnostics ([#7263](https://github.com/tutur3u/platform/issues/7263)) ([29fbabf](https://github.com/tutur3u/platform/commit/29fbabf03498aeb715ba2ec7a6ff4343055c9a34))
* **tools:** repair root script tests and random page test failing on main since [#7411](https://github.com/tutur3u/platform/issues/7411) ([#7424](https://github.com/tutur3u/platform/issues/7424)) ([091d4b8](https://github.com/tutur3u/platform/commit/091d4b8fa5389d57e41b17a34642a4a13c7e0203))
* **tulearn:** interim, parents see no periodic reports (fail-closed) ([#7539](https://github.com/tutur3u/platform/issues/7539)) ([b3b1e48](https://github.com/tutur3u/platform/commit/b3b1e483cc6922ee0fd8480ab43847833c93316b))
* **tulearn:** parents see only approved, sent periodic reports ([#7547](https://github.com/tutur3u/platform/issues/7547)) ([487b501](https://github.com/tutur3u/platform/commit/487b5019de6b13be2cf05ead19461062355332fe))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([16e8ff6](https://github.com/tutur3u/platform/commit/16e8ff65880be827c4c2dc03e7cc186b0b2c7724))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([f913a3c](https://github.com/tutur3u/platform/commit/f913a3c012ba38211e05c6a98692e8d1c7ccc04a))
* **tutoring:** default the schedule teacher picker to tutor groups ([#7172](https://github.com/tutur3u/platform/issues/7172)) ([8e7f682](https://github.com/tutur3u/platform/commit/8e7f6820cd082c95bf129211558b35511c30a0cd))
* **tutoring:** expect total cong in payroll export ([#7279](https://github.com/tutur3u/platform/issues/7279)) ([44c7c50](https://github.com/tutur3u/platform/commit/44c7c50d3a1e0650137bdb6e9b0bdc2dcdbdb8aa))
* **tutoring:** let one teacher tutor many learners in a shared slot ([#7255](https://github.com/tutur3u/platform/issues/7255)) ([daf6835](https://github.com/tutur3u/platform/commit/daf6835daade9216a16efc177a4e8dab6ab0919e))
* **tutoring:** list learners under current classes and needs-tutoring groups ([#7257](https://github.com/tutur3u/platform/issues/7257)) ([07c85f4](https://github.com/tutur3u/platform/commit/07c85f41c16c9ac86ea3afa5710c93bf934454b0))
* **tutoring:** page queue reads past the PostgREST row cap ([#7242](https://github.com/tutur3u/platform/issues/7242)) ([88dd35f](https://github.com/tutur3u/platform/commit/88dd35f96098ca14b7e5e1aa4baf11598c87caf4))
* **tutoring:** page queue reads past the PostgREST row cap ([#7242](https://github.com/tutur3u/platform/issues/7242)) ([45c66e0](https://github.com/tutur3u/platform/commit/45c66e00cf8e2826ac7e9f08372b73b2d27efe44))
* **tutoring:** repeat every selected weekday ([#7109](https://github.com/tutur3u/platform/issues/7109)) ([82fa151](https://github.com/tutur3u/platform/commit/82fa1519939842bb3d4596c89f07f4152f1e6811))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([f029cf6](https://github.com/tutur3u/platform/commit/f029cf6dad6ef202ddd43aefdc15014dbb9eb4bc))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **tutoring:** teach the right content for absent, weak and both rows. ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **ui:** increase light muted foreground contrast ([#7219](https://github.com/tutur3u/platform/issues/7219)) ([e1870dd](https://github.com/tutur3u/platform/commit/e1870dd454293ab614dc636d6ecaba00e84c10dc))
* **ui:** start satellite sidebar closed on mobile ([#7161](https://github.com/tutur3u/platform/issues/7161)) ([d1f4824](https://github.com/tutur3u/platform/commit/d1f482417c36bdf0c0bd179e2a7af6a63537b968))
* **users:** align approval and post delivery scoping ([#6989](https://github.com/tutur3u/platform/issues/6989)) ([d1a7052](https://github.com/tutur3u/platform/commit/d1a7052c247e19467cbff8aa60c8c06dbb46e91d))
* **users:** align workspace read permissions ([#7022](https://github.com/tutur3u/platform/issues/7022)) ([6d81393](https://github.com/tutur3u/platform/commit/6d8139370238d3be6455724c7e71bd296004002e))
* **users:** retire unused compatibility routes ([#6983](https://github.com/tutur3u/platform/issues/6983)) ([008738c](https://github.com/tutur3u/platform/commit/008738c2ff67e5bfbe7fba8fe996ed6dcf29cf23))
* **users:** scope report delivery preview and send to the report's group ([#7061](https://github.com/tutur3u/platform/issues/7061)) ([f85a01e](https://github.com/tutur3u/platform/commit/f85a01ecfe0c67f0fdcd23fc89faa7530d31ce43))
* **users:** tighten workspace read scoping and permissions ([#6979](https://github.com/tutur3u/platform/issues/6979)) ([f720f64](https://github.com/tutur3u/platform/commit/f720f64bc07ad85ec2e41c69d8ead1e342d9d802))
* **users:** validate group-check participants ([#6984](https://github.com/tutur3u/platform/issues/6984)) ([e992446](https://github.com/tutur3u/platform/commit/e9924465065e4c82b915eef194bd8c742fc9ed87))
* **utils:** list the internal Mastermind app in commercial inventory ([#7327](https://github.com/tutur3u/platform/issues/7327)) ([d6da3f1](https://github.com/tutur3u/platform/commit/d6da3f178d0c7198dc7ad5367138724162367cce))
* **utils:** resolve ambiguous DST wall times deterministically ([#7397](https://github.com/tutur3u/platform/issues/7397)) ([523a09b](https://github.com/tutur3u/platform/commit/523a09b40567e89769fc6ab139c860ec7817e5cd))
* **web:** check staff identity before role permissions in crawler and time-tracking routes ([#7260](https://github.com/tutur3u/platform/issues/7260)) ([118e1c6](https://github.com/tutur3u/platform/commit/118e1c60e8f4f2d7048e65722c5ce05a014caa83))
* **web:** claim only Mira's live abilities on the site ([#7216](https://github.com/tutur3u/platform/issues/7216)) ([940d418](https://github.com/tutur3u/platform/commit/940d418aa35b95dc42e4d817cc884c6e3a21c9cd))
* **web:** close candidate cookie domain bypass before staging ([#7096](https://github.com/tutur3u/platform/issues/7096)) ([dd33ba3](https://github.com/tutur3u/platform/commit/dd33ba35554866e2ddfc360bae92340ead45972b))
* **web:** drop unused ts-expect-error in team-access test ([#7331](https://github.com/tutur3u/platform/issues/7331)) ([50075ad](https://github.com/tutur3u/platform/commit/50075adcbb07720fc3bc7d7c494a57463b4a412a))
* **web:** keep onboarding workspaces when the creator is already a member ([#7151](https://github.com/tutur3u/platform/issues/7151)) ([46f932e](https://github.com/tutur3u/platform/commit/46f932e39f16bc73b5378d9b030b09ce632461dc))
* **web:** make staging publisher native-only (no Vercel fallback, 404 not migrated) ([#7422](https://github.com/tutur3u/platform/issues/7422)) ([9e4f62b](https://github.com/tutur3u/platform/commit/9e4f62be9b24e2be79d711725e2d73c27563d0c8))
* **web:** match declined invites to the confirmed account email ([#7148](https://github.com/tutur3u/platform/issues/7148)) ([5e7c6db](https://github.com/tutur3u/platform/commit/5e7c6db997deaa5b6c23ad476c96d6d7041a8b5b))
* **web:** preserve Discord permission client database types ([#7268](https://github.com/tutur3u/platform/issues/7268)) ([286ae27](https://github.com/tutur3u/platform/commit/286ae274cc4d16dcc8483eac4c76ef6d83a7bd95))
* **web:** read the Meet AI transcription allowlist from server-only env on Vercel ([#7382](https://github.com/tutur3u/platform/issues/7382)) ([d327c61](https://github.com/tutur3u/platform/commit/d327c61dda3f37c63c15ea96938f8ff3ef25ce07))
* **web:** return 403 from legacy meeting AI routes before any work ([1804ecd](https://github.com/tutur3u/platform/commit/1804ecdf9407a6d1a62d428c954fc07d797fa17a))
* **web:** ship Meet Together messages to the marketing client provider ([#7056](https://github.com/tutur3u/platform/issues/7056)) ([4ca3feb](https://github.com/tutur3u/platform/commit/4ca3feb3e9fd59c9ef0bbfe5fc6c801d26d99167))
* **web:** type creator-grant test permission payload ([#7201](https://github.com/tutur3u/platform/issues/7201)) ([5b9c5cf](https://github.com/tutur3u/platform/commit/5b9c5cf74fa7ce3ef0ed7e7669d66a145bb46149))
* **workspace:** prevent secrets page render failure ([#6968](https://github.com/tutur3u/platform/issues/6968)) ([0c319f8](https://github.com/tutur3u/platform/commit/0c319f8d1ac244445b424aa3c9c48bed352049c0))
* **workspace:** surface deletion failures and preserve confirmation ([#6969](https://github.com/tutur3u/platform/issues/6969)) ([a6af584](https://github.com/tutur3u/platform/commit/a6af584903a4741934e023776d90bc50667c1a33))


### Performance Improvements

* **ai:** cut Mira time to first token ([#6725](https://github.com/tutur3u/platform/issues/6725)) ([192ce93](https://github.com/tutur3u/platform/commit/192ce93c5cf7d3cf38489d6be97ab589e271778a))
* **auth:** verify the request user once across refresh, guard and MFA ([#7153](https://github.com/tutur3u/platform/issues/7153)) ([959206e](https://github.com/tutur3u/platform/commit/959206efa1b1b686c75a1d17eade931519e8729f))
* **database:** drop nine unused indexes to free production disk ([#7053](https://github.com/tutur3u/platform/issues/7053)) ([c576162](https://github.com/tutur3u/platform/commit/c576162619d563f7e893dfc803655df0281070b2))
* **mail:** load the inbox list without waiting on bootstrap writes ([#7144](https://github.com/tutur3u/platform/issues/7144)) ([05da011](https://github.com/tutur3u/platform/commit/05da011557427cf7bc0b62ae3bb03f11d8c716f5))
* **mobile:** defer optional model recovery until after first paint ([#7203](https://github.com/tutur3u/platform/issues/7203)) ([4b7aad9](https://github.com/tutur3u/platform/commit/4b7aad99835c1015b003607614b89e3104e83758))
* **mobile:** parallelize independent startup init ([#7207](https://github.com/tutur3u/platform/issues/7207)) ([8d30040](https://github.com/tutur3u/platform/commit/8d30040e94bd824cdbc471e2f4c1563e46bda383))
* **mobile:** trim bundle weight ([#7212](https://github.com/tutur3u/platform/issues/7212)) ([0af4cfe](https://github.com/tutur3u/platform/commit/0af4cfeda0afb9e982dea2ab94c23a466748e335))
</details>

<details><summary>ai-studio: 0.20.0</summary>

## [0.20.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.19.0...ai-studio-v0.20.0) (2026-11-04)


### Features

* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **ai:** align journal observation timer with disconnect ([#7303](https://github.com/tutur3u/platform/issues/7303)) ([0b0adde](https://github.com/tutur3u/platform/commit/0b0addedcb7a9394c72ef1a0c4e12cf5540e62da))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>calendar: 0.37.0</summary>

## [0.37.0](https://github.com/tutur3u/platform/compare/calendar-v0.36.0...calendar-v0.37.0) (2026-11-04)


### Features

* **calendar:** admit native production cutover ([#6952](https://github.com/tutur3u/platform/issues/6952)) ([1269e31](https://github.com/tutur3u/platform/commit/1269e310101f1b360ab1dadf0311cafe8a3d337a))
* **calendar:** split staging and production hosts and verify Access on staging ([#7318](https://github.com/tutur3u/platform/issues/7318)) ([e1f9a4c](https://github.com/tutur3u/platform/commit/e1f9a4c69f948c9a458b4adc15f01d6e82807ea4))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
* **web:** harden the staging issuer Worker and its protected Next fallback ([#7319](https://github.com/tutur3u/platform/issues/7319)) ([cb5292d](https://github.com/tutur3u/platform/commit/cb5292dc5fc90c10b2af9e9a241905c3c6f5de99))


### Bug Fixes

* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **calendar:** fail closed when the staging Tasks URL is unset ([#7345](https://github.com/tutur3u/platform/issues/7345)) ([2f9de15](https://github.com/tutur3u/platform/commit/2f9de15500e89f8228fb9f64cd982d0572b89bbc))
* **calendar:** retire the temporary cutover smoke host and record staging G3 blockers ([#7312](https://github.com/tutur3u/platform/issues/7312)) ([e4a2dc5](https://github.com/tutur3u/platform/commit/e4a2dc53118e2f3a0397fc15665b144d568e7687))
* **calendar:** scope connection PATCH and DELETE to the caller workspace ([#7073](https://github.com/tutur3u/platform/issues/7073)) ([78fc480](https://github.com/tutur3u/platform/commit/78fc480694d6ad14d3706f23d7a8dc93fa1e4641))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>cms: 0.39.0</summary>

## [0.39.0](https://github.com/tutur3u/platform/compare/cms-v0.38.0...cms-v0.39.0) (2026-11-04)


### Features

* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **cms:** align form and content workspace permissions ([#7023](https://github.com/tutur3u/platform/issues/7023)) ([798d418](https://github.com/tutur3u/platform/commit/798d4189a31e2bacd66c49ce60d21c3b83241411))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>database: 1.45.0</summary>

## [1.45.0](https://github.com/tutur3u/platform/compare/database-v1.44.0...database-v1.45.0) (2026-11-04)


### Features

* **ai:** create Mira chat with the first message ([#6765](https://github.com/tutur3u/platform/issues/6765)) ([aae4d08](https://github.com/tutur3u/platform/commit/aae4d088b0225d428bce41153bac7cf204d5a8dd))
* **ci:** extend SQL grant guard for declarative safety ([#7249](https://github.com/tutur3u/platform/issues/7249)) ([482f819](https://github.com/tutur3u/platform/commit/482f8195fefcee7beabfb3574743ddd8c48eea18))
* **database:** add declarative schema parity pack and privilege probes ([#7250](https://github.com/tutur3u/platform/issues/7250)) ([9a8f181](https://github.com/tutur3u/platform/commit/9a8f181ac81306443594f8439f88f88289367121))
* **database:** add topic teacher deadline notice types and receipts ([#6975](https://github.com/tutur3u/platform/issues/6975)) ([ee987de](https://github.com/tutur3u/platform/commit/ee987dec1d739c81a8d5eeda0502aa2c436249bf))
* **database:** bind external-project helpers to the caller ([#7119](https://github.com/tutur3u/platform/issues/7119)) ([72ad410](https://github.com/tutur3u/platform/commit/72ad410c6862644e504a6781470c4c38c6ae64af))
* **database:** bind remaining membership helpers to the caller ([#7128](https://github.com/tutur3u/platform/issues/7128)) ([8f95a90](https://github.com/tutur3u/platform/commit/8f95a90945814df9b81ac67d3e8340973051f925))
* **database:** tutoring automation foundation ([#7254](https://github.com/tutur3u/platform/issues/7254)) ([dcc7d73](https://github.com/tutur3u/platform/commit/dcc7d73e488cabedda8874803201ce5c69e57b7f))
* **mastermind:** grant manage_mastermind to the platform owner ([#7204](https://github.com/tutur3u/platform/issues/7204)) ([976df21](https://github.com/tutur3u/platform/commit/976df21e1711a52e0bed3a6d33a7dbefd7e4afe0))
* **meet:** add a fenced 365-day transcript retention purge ([#7276](https://github.com/tutur3u/platform/issues/7276)) ([bb0a4e1](https://github.com/tutur3u/platform/commit/bb0a4e18af0a0ebb4cf7b6dbe712e1ce79554420))
* **meet:** draft consent and retention schema for Tess ([#7264](https://github.com/tutur3u/platform/issues/7264)) ([154a9f2](https://github.com/tutur3u/platform/commit/154a9f24703d792c8d8aff1849cdce9a3fc60f6d))
* **meet:** limit transcript and notes reads to participants and admins ([#7293](https://github.com/tutur3u/platform/issues/7293)) ([ab3216d](https://github.com/tutur3u/platform/commit/ab3216dceaaed5483fa0debd90f091cb9473d06f))
* **storage:** app-side storage access audit log ([#6891](https://github.com/tutur3u/platform/issues/6891)) ([57cc3f1](https://github.com/tutur3u/platform/commit/57cc3f1750a94890f55a9b33496a1694c11c1888))


### Bug Fixes

* **auth:** align cross-app handoff identity ([#7008](https://github.com/tutur3u/platform/issues/7008)) ([e5c30f9](https://github.com/tutur3u/platform/commit/e5c30f95886d20c8cce3a7bad1a9ad7d71a3cb63))
* **auth:** require verified email to link a Microsoft identity ([#7132](https://github.com/tutur3u/platform/issues/7132)) ([d0414bc](https://github.com/tutur3u/platform/commit/d0414bcd93c7997bcdea3fcbfc1efd9ba262d5e4))
* **database:** add caller checks to privileged reporting functions ([#7080](https://github.com/tutur3u/platform/issues/7080)) ([877bb82](https://github.com/tutur3u/platform/commit/877bb82dfb20dd5ea5a3cdc68256f230a63e457c))
* **database:** add membership migration rollbacks (UT-062) ([#7359](https://github.com/tutur3u/platform/issues/7359)) ([45f58a3](https://github.com/tutur3u/platform/commit/45f58a3541de81c4254c41d6b725a42625b6dffc))
* **database:** align AI chat and subscription RPC access ([#7035](https://github.com/tutur3u/platform/issues/7035)) ([9fd1c02](https://github.com/tutur3u/platform/commit/9fd1c021c78467bf692ea759fb8fd48664ed181b))
* **database:** align time-tracking and task RPC permissions ([#7000](https://github.com/tutur3u/platform/issues/7000)) ([6730c79](https://github.com/tutur3u/platform/commit/6730c798f17be276dc3f1fe8efd60306a84b66f3))
* **database:** align workspace merge phase permissions ([#7002](https://github.com/tutur3u/platform/issues/7002)) ([fa47e8d](https://github.com/tutur3u/platform/commit/fa47e8d24c03633e3dbee9f6ccb7d2f9540e3a8e))
* **database:** cascade workspace-owned documents, logs and team memberships ([#6977](https://github.com/tutur3u/platform/issues/6977)) ([12cc8ad](https://github.com/tutur3u/platform/commit/12cc8adfc6aa963efee1e6cc0e2ec299a1cca8d8))
* **database:** harden session management function guards ([#6993](https://github.com/tutur3u/platform/issues/6993)) ([fb921f4](https://github.com/tutur3u/platform/commit/fb921f4f2f102070da9eaaae63629b86c23ca21c))
* **database:** pin notification trigger host and use Vault bearer (SR-327) ([#7113](https://github.com/tutur3u/platform/issues/7113)) ([1c8fdf9](https://github.com/tutur3u/platform/commit/1c8fdf9c9fdd85824f31d1fe562bb9b3c001f4dd))
* **database:** quarantine orphan workspace role permissions before composite FK ([#7358](https://github.com/tutur3u/platform/issues/7358)) ([df66187](https://github.com/tutur3u/platform/commit/df6618727522e2ed7402fdac3b2ddfd80042d0b7))
* **database:** restate employee runtime readiness ACL ([#7231](https://github.com/tutur3u/platform/issues/7231)) ([0047e77](https://github.com/tutur3u/platform/commit/0047e77296c6609401bd07de1fd12f4712568aaf))
* **database:** restore employee readiness and whiteboard payload contracts ([#7189](https://github.com/tutur3u/platform/issues/7189)) ([4666c9c](https://github.com/tutur3u/platform/commit/4666c9c9eec6fed461042bdabc272b0152a075e6))
* **database:** restrict an RPC to the service role ([#7059](https://github.com/tutur3u/platform/issues/7059)) ([4fb4eef](https://github.com/tutur3u/platform/commit/4fb4eef4533f0ca3e654fa5681f91d6010d22d7d))
* **database:** restrict audit and legacy token privileges ([#7112](https://github.com/tutur3u/platform/issues/7112)) ([e6b4c45](https://github.com/tutur3u/platform/commit/e6b4c452c3f2cfc85e38dd18f1ffd0dcabe4d929))
* **database:** restrict remaining privileged definer functions ([#7092](https://github.com/tutur3u/platform/issues/7092)) ([5743c29](https://github.com/tutur3u/platform/commit/5743c290cfccc7c9250f1c9e6027c3318482df74))
* **database:** restrict two internal merge helpers to the service role ([#7069](https://github.com/tutur3u/platform/issues/7069)) ([291bb02](https://github.com/tutur3u/platform/commit/291bb02f9be4a7624a7f525e034ba02b0660df3c))
* **database:** restrict workspace user link repair to the service role ([#6994](https://github.com/tutur3u/platform/issues/6994)) ([debface](https://github.com/tutur3u/platform/commit/debface3d868d9207a4568774c88e0ae7f31bd3d))
* **database:** scope Discord mappings to the linked workspace ([#7014](https://github.com/tutur3u/platform/issues/7014)) ([cc59d0b](https://github.com/tutur3u/platform/commit/cc59d0ba1527509297ec18ac6a1d559991f1fe64))
* **database:** scope public function execution privileges ([#7076](https://github.com/tutur3u/platform/issues/7076)) ([c2e1d7e](https://github.com/tutur3u/platform/commit/c2e1d7ed0287a719c7052967372cc77ee9acd436))
* **database:** scope time request detail references ([#7024](https://github.com/tutur3u/platform/issues/7024)) ([c7fb9f5](https://github.com/tutur3u/platform/commit/c7fb9f523e612c3522460d6edcae98cbb2a3550c))
* **database:** tighten table privileges ([#7197](https://github.com/tutur3u/platform/issues/7197)) ([a43d2c3](https://github.com/tutur3u/platform/commit/a43d2c3d159bcaca6e1716781750d2cdd0135e88))
* **db:** consolidate has_workspace_permission and add manage_mastermind ([#7302](https://github.com/tutur3u/platform/issues/7302)) ([29ef37b](https://github.com/tutur3u/platform/commit/29ef37bf1f47571ade70b0ab3ba879554fa5aa79))
* **db:** guard task cycle links to the cycle workspace ([#6942](https://github.com/tutur3u/platform/issues/6942)) ([54bf36e](https://github.com/tutur3u/platform/commit/54bf36edfff49ffed85957f3f8ceb3260099aeb7))
* **db:** pin merge batch helper definer search_path ([#7282](https://github.com/tutur3u/platform/issues/7282)) ([61d03a8](https://github.com/tutur3u/platform/commit/61d03a8d784558a73889c296a107350015977194))
* **db:** pin time tracking definer search_path and fix linked-request rejection ([#7281](https://github.com/tutur3u/platform/issues/7281)) ([51bb558](https://github.com/tutur3u/platform/commit/51bb55860abbc4900cef61342e8862b97e2f4c72))
* **db:** pin workspace ownership in row policies ([#7136](https://github.com/tutur3u/platform/issues/7136)) ([232181a](https://github.com/tutur3u/platform/commit/232181a6f78f0bf4cb1ddc0cadc0427082163464))
* **db:** protect workspace ownership changes ([#7184](https://github.com/tutur3u/platform/issues/7184)) ([123271e](https://github.com/tutur3u/platform/commit/123271e7d757f0f4c2a335153a92bab7535c8241))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **db:** scope workspace invites to their workspace ([#7137](https://github.com/tutur3u/platform/issues/7137)) ([9cde8ca](https://github.com/tutur3u/platform/commit/9cde8ca40fdcb86fa1cb49dd8f638ff8427fde24))
* **db:** tighten storage insert policies and audit function search_path ([#7356](https://github.com/tutur3u/platform/issues/7356)) ([17a0b2a](https://github.com/tutur3u/platform/commit/17a0b2a0d4b1b077a40e8ce3c1b9fba1bdfad735))
* **db:** tighten workspace ownership change paths ([#7194](https://github.com/tutur3u/platform/issues/7194)) ([b099b73](https://github.com/tutur3u/platform/commit/b099b7303ea29ad9f39df90dfc99352e96b821e4))
* **db:** verify staff identity in domain-gated policies ([#7138](https://github.com/tutur3u/platform/issues/7138)) ([c4593fb](https://github.com/tutur3u/platform/commit/c4593fb27c8aeac4e757235fcdc36fbaf9d5d5a9))
* **finance:** align database workspace boundaries ([#7031](https://github.com/tutur3u/platform/issues/7031)) ([01dbc5b](https://github.com/tutur3u/platform/commit/01dbc5b5f2ddc487e6f239888683026323ad48e7))
* **finance:** require authorized callers for finance read RPCs ([#7003](https://github.com/tutur3u/platform/issues/7003)) ([90d5fe4](https://github.com/tutur3u/platform/commit/90d5fe4e6aa83a565e9b4965d97a54b624ed5518))
* **finance:** restrict legacy finance chart and migration RPCs ([#7006](https://github.com/tutur3u/platform/issues/7006)) ([626ef83](https://github.com/tutur3u/platform/commit/626ef837b37b1af7cf5c576f261b40a939a4b418))
* **finance:** scope categories and transaction access to the workspace ([#7150](https://github.com/tutur3u/platform/issues/7150)) ([f08c4ea](https://github.com/tutur3u/platform/commit/f08c4ead35be9b81465de2505121de003285f651))
* **infra:** guard the managed cron secret in the database ([#7190](https://github.com/tutur3u/platform/issues/7190)) ([300ad76](https://github.com/tutur3u/platform/commit/300ad76390bff5712ba97b57980ec2a28caea345))
* **meet:** preserve host identity and transcript access ([#7030](https://github.com/tutur3u/platform/issues/7030)) ([3753d70](https://github.com/tutur3u/platform/commit/3753d7060ace891269187a7972d4a460148905af))
* **meet:** tighten legacy meeting and recording access ([#7270](https://github.com/tutur3u/platform/issues/7270)) ([08c55af](https://github.com/tutur3u/platform/commit/08c55af1c43bb9354e38aa6bda875e939f8c1003))
* **permissions:** keep role workspace ownership consistent ([#7206](https://github.com/tutur3u/platform/issues/7206)) ([bcd7671](https://github.com/tutur3u/platform/commit/bcd76715785fb17e703e934c3e2b36e672222647))
* **tasks:** restrict task list writes to authorized members ([#7125](https://github.com/tutur3u/platform/issues/7125)) ([f6d616f](https://github.com/tutur3u/platform/commit/f6d616f14bdbd76a215bca76fdfcda995cf356e8))
* **time-tracking:** validate request task, category and linked-session scope ([#7068](https://github.com/tutur3u/platform/issues/7068)) ([716b49f](https://github.com/tutur3u/platform/commit/716b49f97999af4df1f20cc97214385e6e3f4f7d))


### Performance Improvements

* **database:** drop nine unused indexes to free production disk ([#7053](https://github.com/tutur3u/platform/issues/7053)) ([c576162](https://github.com/tutur3u/platform/commit/c576162619d563f7e893dfc803655df0281070b2))
</details>

<details><summary>drive: 0.34.0</summary>

## [0.34.0](https://github.com/tutur3u/platform/compare/drive-v0.33.0...drive-v0.34.0) (2026-11-04)


### Features

* **drive:** add staging Start candidate ([#7085](https://github.com/tutur3u/platform/issues/7085)) ([a211868](https://github.com/tutur3u/platform/commit/a2118681d88fa5073b6b7421e9357824505650b0))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **drive:** expire and revoke export links ([#7140](https://github.com/tutur3u/platform/issues/7140)) ([307f08f](https://github.com/tutur3u/platform/commit/307f08fee6ded7b19fe61901390afa45c33d5dce))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
</details>

<details><summary>external: 0.6.2</summary>

## [0.6.2](https://github.com/tutur3u/platform/compare/external-v0.6.1...external-v0.6.2) (2026-11-04)


### Bug Fixes

* **api:** align export and satellite request boundaries ([#7021](https://github.com/tutur3u/platform/issues/7021)) ([73a876a](https://github.com/tutur3u/platform/commit/73a876aaa7f13eceb13b6e6946e61d8323b1cf10))
</details>

<details><summary>finance: 0.36.0</summary>

## [0.36.0](https://github.com/tutur3u/platform/compare/finance-v0.35.0...finance-v0.36.0) (2026-11-04)


### Features

* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **finance:** align workspace scoping for finance routes ([#7029](https://github.com/tutur3u/platform/issues/7029)) ([2ba27b9](https://github.com/tutur3u/platform/commit/2ba27b96035bbd43288b6c3de1e9ca9909b9243a))
* **finance:** retire the wallet migration writer ([#7126](https://github.com/tutur3u/platform/issues/7126)) ([0ef3673](https://github.com/tutur3u/platform/commit/0ef3673546e17264c2e0edfba413f005a182416c))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>hive: 0.27.0</summary>

## [0.27.0](https://github.com/tutur3u/platform/compare/hive-v0.26.2...hive-v0.27.0) (2026-11-04)


### Features

* **hive:** add Cloudflare maintenance and native migration plan ([#6868](https://github.com/tutur3u/platform/issues/6868)) ([00f1071](https://github.com/tutur3u/platform/commit/00f107166aab3428cc97e84e5284ec13ff127447))
</details>

<details><summary>infra: 0.39.0</summary>

## [0.39.0](https://github.com/tutur3u/platform/compare/infra-v0.38.0...infra-v0.39.0) (2026-11-04)


### Features

* **infrastructure:** add the private ops hub gateway ([#6997](https://github.com/tutur3u/platform/issues/6997)) ([c7be6a7](https://github.com/tutur3u/platform/commit/c7be6a7b766ce04085887cdf5510f62611bf46d8))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* align main unit fixtures with authorization and app inventory ([#7265](https://github.com/tutur3u/platform/issues/7265)) ([0eb1e3a](https://github.com/tutur3u/platform/commit/0eb1e3a8d350c5179bfaad63fc7281bfd47ebbf8))
* **api:** align export and satellite request boundaries ([#7021](https://github.com/tutur3u/platform/issues/7021)) ([73a876a](https://github.com/tutur3u/platform/commit/73a876aaa7f13eceb13b6e6946e61d8323b1cf10))
* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **database:** scope Discord mappings to the linked workspace ([#7014](https://github.com/tutur3u/platform/issues/7014)) ([cc59d0b](https://github.com/tutur3u/platform/commit/cc59d0ba1527509297ec18ac6a1d559991f1fe64))
* **desktop:** publish run-free desktop versions with structured release notes ([#7157](https://github.com/tutur3u/platform/issues/7157)) ([90643d7](https://github.com/tutur3u/platform/commit/90643d747d01672e6f3a8ccc348f26aed0586d5c))
* **infra:** align platform administration permissions ([#7011](https://github.com/tutur3u/platform/issues/7011)) ([18d30ec](https://github.com/tutur3u/platform/commit/18d30ec1204fcd89d7abc8cb463043331330f33d))
* **infra:** require platform admin for workspace secrets ([#7174](https://github.com/tutur3u/platform/issues/7174)) ([496de2e](https://github.com/tutur3u/platform/commit/496de2ef9c819ec73e647e395e80f494a3c696c9))
* **infra:** require verified staff identity for managed cron toggles ([#7181](https://github.com/tutur3u/platform/issues/7181)) ([714983a](https://github.com/tutur3u/platform/commit/714983a56d7672bf221d72841c211fa4dd3c5d63))
* **infrastructure:** align secret and role permission access ([#7013](https://github.com/tutur3u/platform/issues/7013)) ([4917e16](https://github.com/tutur3u/platform/commit/4917e16567f3b348ace0159d6cc982be50b9a8b7))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* restore main type check (meet fixture, track request routes) ([#7232](https://github.com/tutur3u/platform/issues/7232)) ([4fa1436](https://github.com/tutur3u/platform/commit/4fa143673a92161f31b4c300f774ebcbbdef468f))
* **security:** harden staging-host guard and restore reserved-host handling ([#7256](https://github.com/tutur3u/platform/issues/7256)) ([077e48c](https://github.com/tutur3u/platform/commit/077e48c3ecea2841d4c99c9d848122ef1827dd42))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **security:** validate project branches and strip guard comments ([#7271](https://github.com/tutur3u/platform/issues/7271)) ([d718355](https://github.com/tutur3u/platform/commit/d718355c2d86bb875e835326f7744b9832673839))
* **users:** align approval and post delivery scoping ([#6989](https://github.com/tutur3u/platform/issues/6989)) ([d1a7052](https://github.com/tutur3u/platform/commit/d1a7052c247e19467cbff8aa60c8c06dbb46e91d))
</details>

<details><summary>inventory: 0.38.0</summary>

## [0.38.0](https://github.com/tutur3u/platform/compare/inventory-v0.37.0...inventory-v0.38.0) (2026-11-04)


### Features

* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **api:** align user group workspace scoping ([#7001](https://github.com/tutur3u/platform/issues/7001)) ([7c7ec6e](https://github.com/tutur3u/platform/commit/7c7ec6ea248d9a3fdb7aabf9e64fbda1933ad321))
* **api:** align workspace operation permissions and references ([#7033](https://github.com/tutur3u/platform/issues/7033)) ([86c6dd4](https://github.com/tutur3u/platform/commit/86c6dd4dd388a9081334293b0b0005452e846200))
* **groups:** align group and member access checks ([#7028](https://github.com/tutur3u/platform/issues/7028)) ([6fa6453](https://github.com/tutur3u/platform/commit/6fa6453a9b76559fdac74fe6727c71348b090307))
* **inventory:** align product stock routes with adjust-stock permission model ([#7063](https://github.com/tutur3u/platform/issues/7063)) ([68d5c5f](https://github.com/tutur3u/platform/commit/68d5c5f769a8011ce5cb297b2af8130193d3cfa4))
* **inventory:** remove stale server logger fixture ([#6954](https://github.com/tutur3u/platform/issues/6954)) ([eb8842b](https://github.com/tutur3u/platform/commit/eb8842ba190f0603eedbbc9a9aa26e06203e92f2))
* **inventory:** resolve product export test path relative to file ([#6965](https://github.com/tutur3u/platform/issues/6965)) ([1bdb508](https://github.com/tutur3u/platform/commit/1bdb508a97e56885660c59fdd6b32fed45e9c47f))
* **inventory:** type existing stock rows for route comparisons ([#7230](https://github.com/tutur3u/platform/issues/7230)) ([8f5fa7f](https://github.com/tutur3u/platform/commit/8f5fa7f2884642cd7c254d21e9e9a14dd22f1cb9))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>storefront: 0.32.1</summary>

## [0.32.1](https://github.com/tutur3u/platform/compare/storefront-v0.32.0...storefront-v0.32.1) (2026-11-04)


### Bug Fixes

* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>learn: 0.32.1</summary>

## [0.32.1](https://github.com/tutur3u/platform/compare/learn-v0.32.0...learn-v0.32.1) (2026-11-04)


### Bug Fixes

* **education:** scope learner and teacher resource access ([#7017](https://github.com/tutur3u/platform/issues/7017)) ([5942601](https://github.com/tutur3u/platform/commit/59426011aafb60ec51da42f6feb95872834acc60))
* **education:** validate test courses and quiz destinations ([#7020](https://github.com/tutur3u/platform/issues/7020)) ([8535738](https://github.com/tutur3u/platform/commit/8535738863df43f37c64eb8348a9a02377b6308a))
* **learn:** require parent consent for Tulearn parent links (SR-238) ([#7062](https://github.com/tutur3u/platform/issues/7062)) ([b085a0e](https://github.com/tutur3u/platform/commit/b085a0e331aa758fd1e8f490df284b6bf22ed63a))
* **learn:** use typed clients for parent consent helpers ([#7252](https://github.com/tutur3u/platform/issues/7252)) ([d64dc27](https://github.com/tutur3u/platform/commit/d64dc2728e57220415fe5dcf6e2101c717fdbe8f))
* **tulearn:** interim, parents see no periodic reports (fail-closed) ([#7539](https://github.com/tutur3u/platform/issues/7539)) ([b3b1e48](https://github.com/tutur3u/platform/commit/b3b1e483cc6922ee0fd8480ab43847833c93316b))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
</details>

<details><summary>mail: 0.32.0</summary>

## [0.32.0](https://github.com/tutur3u/platform/compare/mail-v0.31.0...mail-v0.32.0) (2026-11-04)


### Features

* **mail:** adopt the shared Start bridge and request mounts ([#6763](https://github.com/tutur3u/platform/issues/6763)) ([d3621e5](https://github.com/tutur3u/platform/commit/d3621e508fcd17c11c781baddb82c7ce42e7886f))
* **mail:** settle the sync icon smoothly and move the mail source into Settings ([#7145](https://github.com/tutur3u/platform/issues/7145)) ([7df69df](https://github.com/tutur3u/platform/commit/7df69df8b8a845d2371802aa7a32e5c150a18097))
* **mail:** tighten the inbox list hierarchy and density ([#7146](https://github.com/tutur3u/platform/issues/7146)) ([5218adf](https://github.com/tutur3u/platform/commit/5218adf56b8fcd7a811020a0bfdc0e976750975f))
* **perf:** measure app switches for the one-origin rollout ([#6756](https://github.com/tutur3u/platform/issues/6756)) ([893f041](https://github.com/tutur3u/platform/commit/893f041e9b242a490a5a4abfa5de86adcd574a12))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))


### Performance Improvements

* **mail:** load the inbox list without waiting on bootstrap writes ([#7144](https://github.com/tutur3u/platform/issues/7144)) ([05da011](https://github.com/tutur3u/platform/commit/05da011557427cf7bc0b62ae3bb03f11d8c716f5))
</details>

<details><summary>meet: 0.36.0</summary>

## [0.36.0](https://github.com/tutur3u/platform/compare/meet-v0.35.0...meet-v0.36.0) (2026-11-04)


### Features

* **meet:** add transcription state and consent protocol ([#7266](https://github.com/tutur3u/platform/issues/7266)) ([2d601a1](https://github.com/tutur3u/platform/commit/2d601a1620cc8d39d425abb0617774c6eb2184bf))
* **meet:** default-allow Meet AI with a kill switch ([#7410](https://github.com/tutur3u/platform/issues/7410)) ([a96f160](https://github.com/tutur3u/platform/commit/a96f1609656bed08678af0dd1fb828711af4278a))
* **meet:** gate Meet AI behind a default-deny workspace allowlist ([#7354](https://github.com/tutur3u/platform/issues/7354)) ([c1ec761](https://github.com/tutur3u/platform/commit/c1ec761dedcdd01041e4b6b82f53aa62f001655f))
* **meet:** inject the abuse-guard service binding ([#6853](https://github.com/tutur3u/platform/issues/6853)) ([5a5e00c](https://github.com/tutur3u/platform/commit/5a5e00cf13cb904ed021159c4cd1f07fb98c26b0))
* **meet:** limit transcript and notes reads to participants and admins ([#7293](https://github.com/tutur3u/platform/issues/7293)) ([ab3216d](https://github.com/tutur3u/platform/commit/ab3216dceaaed5483fa0debd90f091cb9473d06f))
* **perf:** measure app switches for the one-origin rollout ([#6756](https://github.com/tutur3u/platform/issues/6756)) ([893f041](https://github.com/tutur3u/platform/commit/893f041e9b242a490a5a4abfa5de86adcd574a12))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **meet:** admit AI credits before reserving transcript chunks ([#7243](https://github.com/tutur3u/platform/issues/7243)) ([0826b0e](https://github.com/tutur3u/platform/commit/0826b0eeee62421c284f1edfb9e4454bb2d1d526))
* **meet:** tighten legacy meeting and recording access ([#7270](https://github.com/tutur3u/platform/issues/7270)) ([08c55af](https://github.com/tutur3u/platform/commit/08c55af1c43bb9354e38aa6bda875e939f8c1003))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>mobile: 0.27.0</summary>

## [0.27.0](https://github.com/tutur3u/platform/compare/mobile-v0.26.0...mobile-v0.27.0) (2026-11-04)


### Highlights

* **ai:** create Mira chat with the first message ([#6765](https://github.com/tutur3u/platform/issues/6765)) ([aae4d08](https://github.com/tutur3u/platform/commit/aae4d088b0225d428bce41153bac7cf204d5a8dd))
* **mastermind:** add the Inbox ask card and accept the new hub fields ([#7395](https://github.com/tutur3u/platform/issues/7395)) ([fe316e8](https://github.com/tutur3u/platform/commit/fe316e8f95f3e569e26be81faac9fef56c8f8a1f))
* **mastermind:** add the Inbox ask-v2 contract and shared fixture ([#7390](https://github.com/tutur3u/platform/issues/7390)) ([3371d16](https://github.com/tutur3u/platform/commit/3371d16e41c65551939195fb8e2cdcdfb71ccdcf))
* **mastermind:** batch sheet v2, risky asks fail closed ([#7427](https://github.com/tutur3u/platform/issues/7427)) ([8b77935](https://github.com/tutur3u/platform/commit/8b779352b34b02e75e24c5174a5c032149fd1683))
* **mastermind:** catch-up section on Today ([#7213](https://github.com/tutur3u/platform/issues/7213)) ([66dba6f](https://github.com/tutur3u/platform/commit/66dba6f107c966110c078b85a4ac999dc51ce11a))
* **mastermind:** gate access on an explicit manage_mastermind grant ([#7158](https://github.com/tutur3u/platform/issues/7158)) ([3a886df](https://github.com/tutur3u/platform/commit/3a886dfca89d496fdaaa91c1d333603016cd364d))
* **mastermind:** group the Inbox into Urgent, Needs a decision and FYI ([#7412](https://github.com/tutur3u/platform/issues/7412)) ([41fbcc1](https://github.com/tutur3u/platform/commit/41fbcc1a361d1dbc73d09f41e7024a591a562d53))
* **mastermind:** hold one-tap replies for 30 s with undo-all ([#7414](https://github.com/tutur3u/platform/issues/7414)) ([65cfe55](https://github.com/tutur3u/platform/commit/65cfe557bb4bc009c411497fe0a668502eb475ec))
* **mastermind:** wire inbox tiers, ?tier=/?q= and undo-all bar ([#7425](https://github.com/tutur3u/platform/issues/7425)) ([2c5a94c](https://github.com/tutur3u/platform/commit/2c5a94c8f67f02b93e0359884cb6d50081ad268e))
* **mobile:** accessible chart kit for Mastermind insights ([#7040](https://github.com/tutur3u/platform/issues/7040)) ([6118e98](https://github.com/tutur3u/platform/commit/6118e987bd845601f92e4b097460f059550ec03e))
* **mobile:** add Appearance interface styles, density, corners and motion ([#6889](https://github.com/tutur3u/platform/issues/6889)) ([bce582d](https://github.com/tutur3u/platform/commit/bce582dab8db44197ea40d265fca7e89b63ecd08))
* **mobile:** add Education mode and the Today classes card ([#6982](https://github.com/tutur3u/platform/issues/6982)) ([c035dce](https://github.com/tutur3u/platform/commit/c035dce3c3b10686088dfb373a3f36d69194be36))
* **mobile:** add gated read-only Mastermind Threads ([#7171](https://github.com/tutur3u/platform/issues/7171)) ([90f80a2](https://github.com/tutur3u/platform/commit/90f80a2ef141c22eccbcfadf21d8a920c72baca2))
* **mobile:** add Mastermind Work Backlog and Staff segments ([#7110](https://github.com/tutur3u/platform/issues/7110)) ([846f433](https://github.com/tutur3u/platform/commit/846f4337a91966f084ca1178363e8b566d61bc04))
* **mobile:** add read-only Mastermind Machines ([#7227](https://github.com/tutur3u/platform/issues/7227)) ([c753cc1](https://github.com/tutur3u/platform/commit/c753cc19fc6c3c48a5b1f6680ccb1a479095de5e))
* **mobile:** add the Mastermind Decisions journal to the Inbox ([#7134](https://github.com/tutur3u/platform/issues/7134)) ([c793ad2](https://github.com/tutur3u/platform/commit/c793ad2765a2b2e1d7da054debed5d89d46f9260))
* **mobile:** add the Mastermind entry, shell and Home tab ([#7100](https://github.com/tutur3u/platform/issues/7100)) ([c66fa2c](https://github.com/tutur3u/platform/commit/c66fa2ccaba3ed4437c23ee3638f4ce81fda6b9f))
* **mobile:** add the Mastermind Inbox and capability-gated replies ([#7104](https://github.com/tutur3u/platform/issues/7104)) ([6623440](https://github.com/tutur3u/platform/commit/66234407553acd3c38e7be0a650bdb270bb0dc01))
* **mobile:** add the Mastermind Ship and Insights tabs ([#7116](https://github.com/tutur3u/platform/issues/7116)) ([8f6c3cb](https://github.com/tutur3u/platform/commit/8f6c3cbdf83e7be9b6d4b06b1cea19ddd02b5a75))
* **mobile:** add the Mastermind Work tab with lanes and lane detail ([#7106](https://github.com/tutur3u/platform/issues/7106)) ([c5ef891](https://github.com/tutur3u/platform/commit/c5ef8919cdadbc54315095b9239b1401636d9f47))
* **mobile:** answer Mastermind decisions from Home and Inbox ([#7205](https://github.com/tutur3u/platform/issues/7205)) ([595b4bd](https://github.com/tutur3u/platform/commit/595b4bd44ea64074a1e2ccadb8aa1271df278357))
* **mobile:** compact Mastermind Inbox with resolved history ([#7177](https://github.com/tutur3u/platform/issues/7177)) ([4ece677](https://github.com/tutur3u/platform/commit/4ece6778820c2e238856e6425580a888489dba9f))
* **mobile:** compact Mastermind Ship and Insights ([#7175](https://github.com/tutur3u/platform/issues/7175)) ([8091606](https://github.com/tutur3u/platform/commit/809160601ed4786e2b9b86162ebe765cd618a8f6))
* **mobile:** count Focus Time as all task-linked tracked time ([#6922](https://github.com/tutur3u/platform/issues/6922)) ([f6861ba](https://github.com/tutur3u/platform/commit/f6861ba061c807288f58d81c3e042cf979d4f6c0))
* **mobile:** enable the production Mastermind hub for the beta ([#7131](https://github.com/tutur3u/platform/issues/7131)) ([edcc0ed](https://github.com/tutur3u/platform/commit/edcc0ed71c66d4b2581546002277ee8271ac059e))
* **mobile:** full Mastermind decision details ([#7218](https://github.com/tutur3u/platform/issues/7218)) ([9d40f40](https://github.com/tutur3u/platform/commit/9d40f402aefe4fe1c44a085e0c8838dafc1f27fd))
* **mobile:** grouped Mira starters and a You tab with Focus Time and rows ([#6898](https://github.com/tutur3u/platform/issues/6898)) ([d64bbac](https://github.com/tutur3u/platform/commit/d64bbacc324fac5662147d7a0d9892b313ae8caf))
* **mobile:** grouped task detail fields and a device Pomodoro ([#6900](https://github.com/tutur3u/platform/issues/6900)) ([6b0bd0a](https://github.com/tutur3u/platform/commit/6b0bd0ab2888aac5eeea8c4d3382887b29c76f40))
* **mobile:** hardware-backed Iris device key and signer (M0) ([#7364](https://github.com/tutur3u/platform/issues/7364)) ([130e1ed](https://github.com/tutur3u/platform/commit/130e1ed2335678a9990a895baeef357f0886d730))
* **mobile:** Iris chat, ask-card deltas and relay client behind MASTERMIND_IRIS (M0) ([12871a6](https://github.com/tutur3u/platform/commit/12871a6a2f4d49b180a0565c2fb916e7a8128092))
* **mobile:** live Mastermind hub source, disk cache and refresh scheduler (PR2) ([#7086](https://github.com/tutur3u/platform/issues/7086)) ([e566eb9](https://github.com/tutur3u/platform/commit/e566eb9873728fbd0773e4221357e2129d3a076b))
* **mobile:** Mastermind app data foundation and access gate ([#7039](https://github.com/tutur3u/platform/issues/7039)) ([a4f0680](https://github.com/tutur3u/platform/commit/a4f0680818dfbf8b7969577ffdde9feffd95eb9c))
* **mobile:** Mastermind beta polish ([#7123](https://github.com/tutur3u/platform/issues/7123)) ([0e70175](https://github.com/tutur3u/platform/commit/0e70175f2c2ea7bec0a5fd9d736828b430a1e940))
* **mobile:** Mastermind UX foundation and Home redesign ([#7176](https://github.com/tutur3u/platform/issues/7176)) ([ca1a2a7](https://github.com/tutur3u/platform/commit/ca1a2a76dd197aaaed00353cf59383ab8f68f2fe))
* **mobile:** name the root tabs Mira, Inbox and You and add dock search ([#6897](https://github.com/tutur3u/platform/issues/6897)) ([8542531](https://github.com/tutur3u/platform/commit/8542531f21fc114ea6ed2d3461b6233daa12435b))
* **mobile:** open the task menu on Kanban card long-press ([#6937](https://github.com/tutur3u/platform/issues/6937)) ([ff78fca](https://github.com/tutur3u/platform/commit/ff78fca153ac26a27a9245a46445953fd19c45ce))
* **mobile:** rebuild inventory item list with scan and search ([#6976](https://github.com/tutur3u/platform/issues/6976)) ([7870512](https://github.com/tutur3u/platform/commit/787051239f9d5ea503515dd9c284002e31c65f24))
* **mobile:** redesign the board timeline as a day agenda ([#6981](https://github.com/tutur3u/platform/issues/6981)) ([caca4bd](https://github.com/tutur3u/platform/commit/caca4bd84f2e49fab6e579a6748ed86da02329d9))
* **mobile:** redesign the Mastermind decision screen with a shared design system ([#7217](https://github.com/tutur3u/platform/issues/7217)) ([e09c59b](https://github.com/tutur3u/platform/commit/e09c59b963abdd1089943921c809625ac3ad318f))
* **mobile:** redesign the task quick actions sheet ([#6974](https://github.com/tutur3u/platform/issues/6974)) ([cb276a3](https://github.com/tutur3u/platform/commit/cb276a35afdb52e20305aa849ca9823dfa3a9229))
* **mobile:** regroup Home into Today, Up next and Calendar with workspace chips ([#6893](https://github.com/tutur3u/platform/issues/6893)) ([84ea920](https://github.com/tutur3u/platform/commit/84ea9204226fd545ca4acde9ab0c14d9c41dcd09))
* **mobile:** relative Mastermind times with time zone tooltip ([#7223](https://github.com/tutur3u/platform/issues/7223)) ([4e3e9ce](https://github.com/tutur3u/platform/commit/4e3e9cedcc04af307210f68d8fc890a6d5790cee))
* **mobile:** SB-100 L2 app-switcher blur and S3 constant security label ([#7240](https://github.com/tutur3u/platform/issues/7240)) ([94d82f3](https://github.com/tutur3u/platform/commit/94d82f3365ef11c2e0e048d5ec197ad8983ba764))
* **mobile:** set and clear task dates from the quick actions sheet ([#7079](https://github.com/tutur3u/platform/issues/7079)) ([7e59200](https://github.com/tutur3u/platform/commit/7e592002bac648a6c533908ee67b94f2d141b8ae))
* **mobile:** show decisions answered elsewhere ([#7211](https://github.com/tutur3u/platform/issues/7211)) ([2f00366](https://github.com/tutur3u/platform/commit/2f0036634ae4d81588a528cefa433117773a9cd1))
* **mobile:** show every Mastermind decision with lazy loading ([#7221](https://github.com/tutur3u/platform/issues/7221)) ([030231d](https://github.com/tutur3u/platform/commit/030231d8669dbdee94ab40d6ed0896e1295239bc))
* **mobile:** sync Appearance per account with a device override ([#6938](https://github.com/tutur3u/platform/issues/6938)) ([340ef08](https://github.com/tutur3u/platform/commit/340ef08c57fc57d457d464ac60b63e3c42042905))
* **mobile:** telemetry consent prompt and privacy choice ([#7214](https://github.com/tutur3u/platform/issues/7214)) ([63c9d59](https://github.com/tutur3u/platform/commit/63c9d59e6903c47be80bb27a013d7a260307f8db))
* **mobile:** true activity counts and a capped Home for Mastermind ([d2e0996](https://github.com/tutur3u/platform/commit/d2e099645ca43a39f111376f8ce6115b033d823a))
* **time-tracking:** tag Pomodoro sessions and count Focus Time from them ([#6903](https://github.com/tutur3u/platform/issues/6903)) ([783c384](https://github.com/tutur3u/platform/commit/783c38480a786e57aa9a4d70e1bf95b7e18bf19c))
* **web:** add signed Mastermind push-events route ([#7133](https://github.com/tutur3u/platform/issues/7133)) ([8416d3c](https://github.com/tutur3u/platform/commit/8416d3cb54dced26149d0d82316739cd2842fcfa))


### Fixes

* **ai:** cut Mira time to first token ([#6725](https://github.com/tutur3u/platform/issues/6725)) ([192ce93](https://github.com/tutur3u/platform/commit/192ce93c5cf7d3cf38489d6be97ab589e271778a))
* **auth:** restrict Microsoft sign-in to the staff tenant ([#7169](https://github.com/tutur3u/platform/issues/7169)) ([ae20ab4](https://github.com/tutur3u/platform/commit/ae20ab41ffd387a6d0ba45fa8d73d456445283ac))
* **desktop:** publish run-free desktop versions with structured release notes ([#7157](https://github.com/tutur3u/platform/issues/7157)) ([90643d7](https://github.com/tutur3u/platform/commit/90643d747d01672e6f3a8ccc348f26aed0586d5c))
* **mastermind:** persist mobile replies during undo ([#7208](https://github.com/tutur3u/platform/issues/7208)) ([1c1411d](https://github.com/tutur3u/platform/commit/1c1411dc46fe1f8f61580bece789ec96b28eacc1))
* **mobile:** accept CDN-weakened ETags from the Mastermind hub ([#7156](https://github.com/tutur3u/platform/issues/7156)) ([3837c57](https://github.com/tutur3u/platform/commit/3837c571b7db63e9f8846e49c775399a15186a11))
* **mobile:** accept release and quota field envelopes ([f1fb5f4](https://github.com/tutur3u/platform/commit/f1fb5f4cf87e534769f62bd1088ab960e2f78f47))
* **mobile:** annotate usage gaps and retain hub status reasons ([256ae3f](https://github.com/tutur3u/platform/commit/256ae3f6a3b48d66291acd7d70646aeab3e6dc07))
* **mobile:** close the persisted telemetry-enable gap and add the iOS privacy manifest ([#7294](https://github.com/tutur3u/platform/issues/7294)) ([99e3b92](https://github.com/tutur3u/platform/commit/99e3b92c4bebde248509c44f8c1b432c0ba89750))
* **mobile:** complete pull-to-refresh across remote lists ([#6980](https://github.com/tutur3u/platform/issues/6980)) ([1fef0b9](https://github.com/tutur3u/platform/commit/1fef0b99603e3ba1395c38869e52753342602d18))
* **mobile:** consume Forge companion fields and verify publisher fixture ([41caf51](https://github.com/tutur3u/platform/commit/41caf5177023e67302e003126946c18f7e633d5d))
* **mobile:** correct Mastermind Home freshness and accessible controls ([4bcf709](https://github.com/tutur3u/platform/commit/4bcf70910140da69840d0e728d7ee6e611a60106))
* **mobile:** defer optional model recovery until after first paint ([#7203](https://github.com/tutur3u/platform/issues/7203)) ([4b7aad9](https://github.com/tutur3u/platform/commit/4b7aad99835c1015b003607614b89e3104e83758))
* **mobile:** harden Mastermind hub snapshot parsing ([#7173](https://github.com/tutur3u/platform/issues/7173)) ([b27e563](https://github.com/tutur3u/platform/commit/b27e563ccf0b52c9e84566dc5238b1ced846a244))
* **mobile:** harden release URLs, keychain class, backups and PKCE storage ([#7124](https://github.com/tutur3u/platform/issues/7124)) ([d947c18](https://github.com/tutur3u/platform/commit/d947c18d44abb936c237d7c21cdb5f15b1833005))
* **mobile:** harden secure storage adoption and session retries ([#7167](https://github.com/tutur3u/platform/issues/7167)) ([26118b8](https://github.com/tutur3u/platform/commit/26118b8b87014bb83cda0b7ad3d295183897908b))
* **mobile:** harden task-row swipes, roll back failed edits, add Start focus ([#6886](https://github.com/tutur3u/platform/issues/6886)) ([f2ab16a](https://github.com/tutur3u/platform/commit/f2ab16a81b6b122af81a075c77ec9550e168693a))
* **mobile:** keep Mastermind count tiles tappable via semantics and ignore misdated fleet points ([c05d993](https://github.com/tutur3u/platform/commit/c05d99382bc45470113fb8938a6b0cf8b4e2184f))
* **mobile:** keep unreadable Mastermind quotas visible ([#7310](https://github.com/tutur3u/platform/issues/7310)) ([9b8eaf7](https://github.com/tutur3u/platform/commit/9b8eaf72810de3c3e7fe43fe707511fe93e76f86))
* **mobile:** let Mastermind tile labels wrap instead of truncating ([08076c5](https://github.com/tutur3u/platform/commit/08076c57b629b0b4a104b01da37ddd213efb372e))
* **mobile:** manage workspace visibility and filter Home choices ([#6978](https://github.com/tutur3u/platform/issues/6978)) ([8d625ae](https://github.com/tutur3u/platform/commit/8d625ae0a791b16db681a9ce238c66d0a8194003))
* **mobile:** migrate device storage and recover duplicate sessions ([884c9bc](https://github.com/tutur3u/platform/commit/884c9bcd20a017d42f9c955963e8d5bfaa2da483))
* **mobile:** one search action, centred Mira prompt, Profile edit button and count-chip cleanup ([#6973](https://github.com/tutur3u/platform/issues/6973)) ([7b74bb1](https://github.com/tutur3u/platform/commit/7b74bb11409df047a1e5fbac5d79e785909cb12d))
* **mobile:** parallelize independent startup init ([#7207](https://github.com/tutur3u/platform/issues/7207)) ([8d30040](https://github.com/tutur3u/platform/commit/8d30040e94bd824cdbc471e2f4c1563e46bda383))
* **mobile:** preserve running timers and focus session recovery ([8c550d7](https://github.com/tutur3u/platform/commit/8c550d76c311c54c6139e957234f0d7b757729f3))
* **mobile:** preserve sessions during keychain duplicate retries ([744c09a](https://github.com/tutur3u/platform/commit/744c09a88ab81c0d37b362740c587ff80807fb8c))
* **mobile:** prevent task estimation crashes ([#6971](https://github.com/tutur3u/platform/issues/6971)) ([bae4818](https://github.com/tutur3u/platform/commit/bae48188780882f496a7838648708f049f1c58f4))
* **mobile:** prioritize staged sessions during recovery ([7ad2b2e](https://github.com/tutur3u/platform/commit/7ad2b2e938c2516add26c911ee4828b3ffbd1f03))
* **mobile:** reconcile Mastermind decisions and explain missing data ([eae3a0c](https://github.com/tutur3u/platform/commit/eae3a0c97b5955e70268d3a165a771f589bb5f55))
* **mobile:** register push tokens only after notification permission ([#7277](https://github.com/tutur3u/platform/issues/7277)) ([b967fc7](https://github.com/tutur3u/platform/commit/b967fc7cb56c569c9d60f7c1af331da4ffc0751e))
* **mobile:** replace stale staged sessions before persisting ([e089770](https://github.com/tutur3u/platform/commit/e0897701128aadefc406dd28a2fa8e1c575d423c))
* **mobile:** restore missing pacing glyph and align reason assertions ([6aae2d6](https://github.com/tutur3u/platform/commit/6aae2d66807a245124605437a6dd4b083a50bbfc))
* **mobile:** route Mira attachments on a held chat through New chat ([#7077](https://github.com/tutur3u/platform/issues/7077)) ([d607e95](https://github.com/tutur3u/platform/commit/d607e952e72b454a5c414b6e84576201d47d9bc1))
* **mobile:** route Mira attachments on a held chat through New chat. ([d607e95](https://github.com/tutur3u/platform/commit/d607e952e72b454a5c414b6e84576201d47d9bc1))
* **mobile:** serialize pinned workspace saves behind security checks ([#7074](https://github.com/tutur3u/platform/issues/7074)) ([4e2dc62](https://github.com/tutur3u/platform/commit/4e2dc62d67b40a60b35d5122e1bd423540370dc2))
* **mobile:** stack mastermind segments instead of scrolling at large text ([85959dd](https://github.com/tutur3u/platform/commit/85959ddda4d86bdc311d2fa0f026a4e092197661))
* **mobile:** stop Mira chat scroll teleport and clear the composer on send ([#6734](https://github.com/tutur3u/platform/issues/6734)) ([e3c0770](https://github.com/tutur3u/platform/commit/e3c07706c3b30d229548a1ffa0e179c95d5aa89e))
* **mobile:** tolerate hub additions and preserve dock clearance ([ada4823](https://github.com/tutur3u/platform/commit/ada4823ccf962a50078a6de3a0f74dc1208d8a97))
* **mobile:** trim bundle weight ([#7212](https://github.com/tutur3u/platform/issues/7212)) ([0af4cfe](https://github.com/tutur3u/platform/commit/0af4cfeda0afb9e982dea2ab94c23a466748e335))
* **mobile:** upload Mira attachments into the selected chat's store ([#6724](https://github.com/tutur3u/platform/issues/6724)) ([2109920](https://github.com/tutur3u/platform/commit/21099205486b88ca5aa9562071eab3e04dd7877b))
* **mobile:** wait for quick-action mutations to finish ([#7322](https://github.com/tutur3u/platform/issues/7322)) ([7a9a2c2](https://github.com/tutur3u/platform/commit/7a9a2c223be2e650be76727066c76e269f1fc211))
* **time-tracking:** bound tagged stats, refuse tags on manual entries, migrate legacy Pomodoro state ([#6905](https://github.com/tutur3u/platform/issues/6905)) ([a4ecda3](https://github.com/tutur3u/platform/commit/a4ecda3b69c763430ef59ea98674306383e31ffa))
</details>

<details><summary>nova: 0.42.3</summary>

## [0.42.3](https://github.com/tutur3u/platform/compare/nova-v0.42.2...nova-v0.42.3) (2026-11-04)


### Bug Fixes

* **abuse-guard:** enforce durable command fairness ([#6865](https://github.com/tutur3u/platform/issues/6865)) ([1c44022](https://github.com/tutur3u/platform/commit/1c440227fb512187bb98dddf00b92c7127078e04))
* **auth:** scope challenge and participant management ([#7026](https://github.com/tutur3u/platform/issues/7026)) ([0991afe](https://github.com/tutur3u/platform/commit/0991afedb1757203fb4d95496e2cc034df6aa4fc))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>playground: 0.6.2</summary>

## [0.6.2](https://github.com/tutur3u/platform/compare/playground-v0.6.1...playground-v0.6.2) (2026-11-04)


### Bug Fixes

* **playground:** require a signed-in staff session for AI routes and pages ([#7215](https://github.com/tutur3u/platform/issues/7215)) ([e4e42e0](https://github.com/tutur3u/platform/commit/e4e42e06ca651b9838e06248f9ad4add952768d0))
</details>

<details><summary>tools: 0.23.0</summary>

## [0.23.0](https://github.com/tutur3u/platform/compare/tools-v0.22.1...tools-v0.23.0) (2026-11-04)


### Features

* **tools:** run Tools on TanStack Start + Void through the start bridge ([#7411](https://github.com/tutur3u/platform/issues/7411)) ([41e6ef1](https://github.com/tutur3u/platform/commit/41e6ef14bd87729309104931e761711f7e7b6d33))


### Bug Fixes

* **tools:** repair root script tests and random page test failing on main since [#7411](https://github.com/tutur3u/platform/issues/7411) ([#7424](https://github.com/tutur3u/platform/issues/7424)) ([091d4b8](https://github.com/tutur3u/platform/commit/091d4b8fa5389d57e41b17a34642a4a13c7e0203))
</details>

<details><summary>rewise: 0.46.0</summary>

## [0.46.0](https://github.com/tutur3u/platform/compare/rewise-v0.45.0...rewise-v0.46.0) (2026-11-04)


### Features

* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
</details>

<details><summary>tasks: 0.41.0</summary>

## [0.41.0](https://github.com/tutur3u/platform/compare/tasks-v0.40.0...tasks-v0.41.0) (2026-11-04)


### Features

* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **api:** align export and satellite request boundaries ([#7021](https://github.com/tutur3u/platform/issues/7021)) ([73a876a](https://github.com/tutur3u/platform/commit/73a876aaa7f13eceb13b6e6946e61d8323b1cf10))
* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **database:** align time-tracking and task RPC permissions ([#7000](https://github.com/tutur3u/platform/issues/7000)) ([6730c79](https://github.com/tutur3u/platform/commit/6730c798f17be276dc3f1fe8efd60306a84b66f3))
* **infrastructure:** align secret and role permission access ([#7013](https://github.com/tutur3u/platform/issues/7013)) ([4917e16](https://github.com/tutur3u/platform/commit/4917e16567f3b348ace0159d6cc982be50b9a8b7))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **tasks:** complete guest board test auth fixture ([#7225](https://github.com/tutur3u/platform/issues/7225)) ([84827c6](https://github.com/tutur3u/platform/commit/84827c6b492c81a942fca43ca2ab170890f0b554))
* **tasks:** restrict task list writes to authorized members ([#7125](https://github.com/tutur3u/platform/issues/7125)) ([f6d616f](https://github.com/tutur3u/platform/commit/f6d616f14bdbd76a215bca76fdfcda995cf356e8))
* **tasks:** scope board capacity rules and public-link writes (SR-229) ([#7060](https://github.com/tutur3u/platform/issues/7060)) ([cda3344](https://github.com/tutur3u/platform/commit/cda3344e084e4f95a7a2d66aab3817d93104518e))
</details>

<details><summary>teach: 0.28.1</summary>

## [0.28.1](https://github.com/tutur3u/platform/compare/teach-v0.28.0...teach-v0.28.1) (2026-11-04)


### Bug Fixes

* align main unit fixtures with authorization and app inventory ([#7265](https://github.com/tutur3u/platform/issues/7265)) ([0eb1e3a](https://github.com/tutur3u/platform/commit/0eb1e3a8d350c5179bfaad63fc7281bfd47ebbf8))
* **education:** scope learner and teacher resource access ([#7017](https://github.com/tutur3u/platform/issues/7017)) ([5942601](https://github.com/tutur3u/platform/commit/59426011aafb60ec51da42f6feb95872834acc60))
* **education:** validate test courses and quiz destinations ([#7020](https://github.com/tutur3u/platform/issues/7020)) ([8535738](https://github.com/tutur3u/platform/commit/8535738863df43f37c64eb8348a9a02377b6308a))
* **groups:** align group and member access checks ([#7028](https://github.com/tutur3u/platform/issues/7028)) ([6fa6453](https://github.com/tutur3u/platform/commit/6fa6453a9b76559fdac74fe6727c71348b090307))
* **teach:** enforce page-level workspace membership ([#7098](https://github.com/tutur3u/platform/issues/7098)) ([77f5869](https://github.com/tutur3u/platform/commit/77f58694876e8320dcf38789f4b0ba2c5725589a))
* **teach:** scope module pages to the workspace (F8) ([#7082](https://github.com/tutur3u/platform/issues/7082)) ([7925a33](https://github.com/tutur3u/platform/commit/7925a33d05070f6eea74adacc1dd728b301df31d))
* **teach:** scope quiz set and module reads to the route workspace ([#7078](https://github.com/tutur3u/platform/issues/7078)) ([4be48e4](https://github.com/tutur3u/platform/commit/4be48e41cf255f59f06586b069102cc52b015a1c))
* **teach:** scope quiz-set module link to the route workspace ([#7067](https://github.com/tutur3u/platform/issues/7067)) ([2a7cefb](https://github.com/tutur3u/platform/commit/2a7cefbe3911e75077bdc9e6659df479097184f4))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
</details>

<details><summary>contacts: 0.30.0</summary>

## [0.30.0](https://github.com/tutur3u/platform/compare/contacts-v0.29.0...contacts-v0.30.0) (2026-11-04)


### Features

* **contacts:** add default-off Start candidate ([#7120](https://github.com/tutur3u/platform/issues/7120)) ([9a7795d](https://github.com/tutur3u/platform/commit/9a7795d2036bb1be9c346b3461abeef8f4eb0642))
* **contacts:** add teacher topic form and supervisor assignment ([#6929](https://github.com/tutur3u/platform/issues/6929)) ([2ef4ddc](https://github.com/tutur3u/platform/commit/2ef4ddce414748093bba366211698ab4f9fc5385))
* **contacts:** add tutoring teacher công report ([#7297](https://github.com/tutur3u/platform/issues/7297)) ([770665b](https://github.com/tutur3u/platform/commit/770665b7303ead6264845c9e7679f09cb09c169e))
* **contacts:** monthly GVNN schedule editor with month clone ([#6927](https://github.com/tutur3u/platform/issues/6927)) ([13c4e0b](https://github.com/tutur3u/platform/commit/13c4e0b43cdc20a4566187386a8eecf21157a79b))
* **contacts:** pick an existing topic contact in the add-contact form ([#7047](https://github.com/tutur3u/platform/issues/7047)) ([f025e29](https://github.com/tutur3u/platform/commit/f025e290bbf0acd7ede7554876dc2a1f8ff18dd1))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
* **tutoring:** add workspace campus list and announcement place picker ([#7049](https://github.com/tutur3u/platform/issues/7049)) ([9ae0a76](https://github.com/tutur3u/platform/commit/9ae0a76828670c29cbdce07638d0213324453a6d))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([5b52e01](https://github.com/tutur3u/platform/commit/5b52e018e1789d47ea2fbab7d85be3a3ec48e4cc))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([9eb14a6](https://github.com/tutur3u/platform/commit/9eb14a6c62076e5f59d5f412a504833e58a81bb6))
* **tutoring:** tutor groups for the policy, teacher picker and queues ([#7054](https://github.com/tutur3u/platform/issues/7054)) ([5298df0](https://github.com/tutur3u/platform/commit/5298df043e186f242d660b018d0003f608ec04a8))


### Bug Fixes

* **contacts:** GVNN schedule notify teachers, swap race and unsaved-changes guard ([#6966](https://github.com/tutur3u/platform/issues/6966)) ([429bcb3](https://github.com/tutur3u/platform/commit/429bcb30bb03f082c523e8f06c5f3b8c493ac2f4))
* **contacts:** restore proxied topic APIs and schedule navigation ([#6967](https://github.com/tutur3u/platform/issues/6967)) ([ef0f982](https://github.com/tutur3u/platform/commit/ef0f982a50a67beaf95e32375ced01eeae2f67dc))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **reports:** monthly report summary counts on first load ([#7527](https://github.com/tutur3u/platform/issues/7527)) ([72d124e](https://github.com/tutur3u/platform/commit/72d124ebf98fc35d91a902c8be4787216c0803ae))
* **staging:** use canonical web session issuer ([#7313](https://github.com/tutur3u/platform/issues/7313)) ([7244666](https://github.com/tutur3u/platform/commit/72446666a4d71e59f4e79da3a9440a15128233fa))
* **storage:** own upload budget for workspace-managed user avatars ([#7289](https://github.com/tutur3u/platform/issues/7289)) ([25f6903](https://github.com/tutur3u/platform/commit/25f69034808c5aaf26493b9c27cc2f9fe3f75087))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([16e8ff6](https://github.com/tutur3u/platform/commit/16e8ff65880be827c4c2dc03e7cc186b0b2c7724))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([f913a3c](https://github.com/tutur3u/platform/commit/f913a3c012ba38211e05c6a98692e8d1c7ccc04a))
* **tutoring:** default the schedule teacher picker to tutor groups ([#7172](https://github.com/tutur3u/platform/issues/7172)) ([8e7f682](https://github.com/tutur3u/platform/commit/8e7f6820cd082c95bf129211558b35511c30a0cd))
* **tutoring:** let one teacher tutor many learners in a shared slot ([#7255](https://github.com/tutur3u/platform/issues/7255)) ([daf6835](https://github.com/tutur3u/platform/commit/daf6835daade9216a16efc177a4e8dab6ab0919e))
* **tutoring:** list learners under current classes and needs-tutoring groups ([#7257](https://github.com/tutur3u/platform/issues/7257)) ([07c85f4](https://github.com/tutur3u/platform/commit/07c85f41c16c9ac86ea3afa5710c93bf934454b0))
* **tutoring:** repeat every selected weekday ([#7109](https://github.com/tutur3u/platform/issues/7109)) ([82fa151](https://github.com/tutur3u/platform/commit/82fa1519939842bb3d4596c89f07f4152f1e6811))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([f029cf6](https://github.com/tutur3u/platform/commit/f029cf6dad6ef202ddd43aefdc15014dbb9eb4bc))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **tutoring:** teach the right content for absent, weak and both rows. ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **users:** tighten workspace read scoping and permissions ([#6979](https://github.com/tutur3u/platform/issues/6979)) ([f720f64](https://github.com/tutur3u/platform/commit/f720f64bc07ad85ec2e41c69d8ead1e342d9d802))
</details>

<details><summary>forms: 0.21.0</summary>

## [0.21.0](https://github.com/tutur3u/platform/compare/forms-v0.20.0...forms-v0.21.0) (2026-11-04)


### Features

* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **cms:** align form and content workspace permissions ([#7023](https://github.com/tutur3u/platform/issues/7023)) ([798d418](https://github.com/tutur3u/platform/commit/798d4189a31e2bacd66c49ce60d21c3b83241411))
* **forms:** align definition and media workspace access ([#7015](https://github.com/tutur3u/platform/issues/7015)) ([98a5757](https://github.com/tutur3u/platform/commit/98a57572ce4e99b3b5240245c1577875a85de88b))
* **forms:** scope share-link lookup to the resolved workspace ([#7065](https://github.com/tutur3u/platform/issues/7065)) ([869062d](https://github.com/tutur3u/platform/commit/869062d27200a075ba1afe112c0ae0ca2ac05661))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>git: 0.16.0</summary>

## [0.16.0](https://github.com/tutur3u/platform/compare/git-v0.15.0...git-v0.16.0) (2026-11-04)


### Features

* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
</details>

<details><summary>track: 0.32.0</summary>

## [0.32.0](https://github.com/tutur3u/platform/compare/track-v0.31.0...track-v0.32.0) (2026-11-04)


### Features

* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* restore main type check (meet fixture, track request routes) ([#7232](https://github.com/tutur3u/platform/issues/7232)) ([4fa1436](https://github.com/tutur3u/platform/commit/4fa143673a92161f31b4c300f774ebcbbdef468f))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **time-tracking:** validate request task, category and linked-session scope ([#7068](https://github.com/tutur3u/platform/issues/7068)) ([716b49f](https://github.com/tutur3u/platform/commit/716b49f97999af4df1f20cc97214385e6e3f4f7d))
</details>

<details><summary>agent-quota: 0.2.1</summary>

## [0.2.1](https://github.com/tutur3u/platform/compare/agent-quota-v0.2.0...agent-quota-v0.2.1) (2026-11-04)


### Bug Fixes

* **agent-quota:** deflake concurrent ledger lock admissions ([#7286](https://github.com/tutur3u/platform/issues/7286)) ([b128439](https://github.com/tutur3u/platform/commit/b1284391c9b40179795cb0dc9f9d7a99ede839c0))
* **agent-quota:** treat EPERM on an expired lease as stale ([#7344](https://github.com/tutur3u/platform/issues/7344)) ([c30b400](https://github.com/tutur3u/platform/commit/c30b400ce520967c9e5e926c72f8d32dc6da7fc4))
</details>

<details><summary>start-bridge: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/start-bridge-v0.1.0...start-bridge-v0.2.0) (2026-11-04)


### Features

* **contacts:** add default-off Start candidate ([#7120](https://github.com/tutur3u/platform/issues/7120)) ([9a7795d](https://github.com/tutur3u/platform/commit/9a7795d2036bb1be9c346b3461abeef8f4eb0642))


### Bug Fixes

* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>ai: 0.19.0</summary>

## [0.19.0](https://github.com/tutur3u/platform/compare/ai-v0.18.3...ai-v0.19.0) (2026-11-04)


### Features

* **ai:** add private Meet transcription evaluation harness ([#7269](https://github.com/tutur3u/platform/issues/7269)) ([28a5503](https://github.com/tutur3u/platform/commit/28a5503f53655583230e95046869485012a72575))
* **meet:** default-allow Meet AI with a kill switch ([#7410](https://github.com/tutur3u/platform/issues/7410)) ([a96f160](https://github.com/tutur3u/platform/commit/a96f1609656bed08678af0dd1fb828711af4278a))
* **meet:** fail-closed per-user Meet AI limiter ([#7417](https://github.com/tutur3u/platform/issues/7417)) ([fca5cb0](https://github.com/tutur3u/platform/commit/fca5cb0b31a5966bab2d8fe16b9d0c8f2f7986fe))
* **meet:** improve transcription quality and support solo meetings ([#7267](https://github.com/tutur3u/platform/issues/7267)) ([ecc5e53](https://github.com/tutur3u/platform/commit/ecc5e53bfa6423ddbd9aaf789e6779c551064eab))


### Bug Fixes

* **ai:** accept only user and assistant chat input from clients ([#7139](https://github.com/tutur3u/platform/issues/7139)) ([3d6d542](https://github.com/tutur3u/platform/commit/3d6d54204c6b557ecb5a44c05c3e5d5fabf235cd))
* **ai:** gate meeting transcription on the Meet AI allowlist and fail closed on rate-limit outages ([#7380](https://github.com/tutur3u/platform/issues/7380)) ([f303930](https://github.com/tutur3u/platform/commit/f3039306dfa2459e7c60e6604d9043b1f8b258dc))
* **ai:** read evaluation inputs through one file handle ([#7280](https://github.com/tutur3u/platform/issues/7280)) ([c77068a](https://github.com/tutur3u/platform/commit/c77068a7515a21adfbe1fa42a6586c7113228982))
* **ai:** require workspace access for meeting transcription ([#7357](https://github.com/tutur3u/platform/issues/7357)) ([c2763ae](https://github.com/tutur3u/platform/commit/c2763aeb66c094982c3bf8fa83d5b2da6d5cc3a5))
* **ai:** validate public request admission before workspace lookups ([#7027](https://github.com/tutur3u/platform/issues/7027)) ([c969617](https://github.com/tutur3u/platform/commit/c96961748c672c2ca588c9a499a253a3f58a0f82))
* **ai:** validate public request admission before workspace lookups. ([c969617](https://github.com/tutur3u/platform/commit/c96961748c672c2ca588c9a499a253a3f58a0f82))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **infrastructure:** align secret and role permission access ([#7013](https://github.com/tutur3u/platform/issues/7013)) ([4917e16](https://github.com/tutur3u/platform/commit/4917e16567f3b348ace0159d6cc982be50b9a8b7))
* **integrations:** align AI and project request authorization ([#7012](https://github.com/tutur3u/platform/issues/7012)) ([606e882](https://github.com/tutur3u/platform/commit/606e882bb3c44f39eb7277f4a9701acc492a025b))
* **meet:** bill Meet AI to the meeting workspace's AI credits ([#7408](https://github.com/tutur3u/platform/issues/7408)) ([0f8b6dc](https://github.com/tutur3u/platform/commit/0f8b6dcac84f7b29d4c6a15e574330d7b3ad4349))
* **mobile:** upload Mira attachments into the selected chat's store ([#6724](https://github.com/tutur3u/platform/issues/6724)) ([2109920](https://github.com/tutur3u/platform/commit/21099205486b88ca5aa9562071eab3e04dd7877b))
* **packages:** make the published [@tuturuuu](https://github.com/tuturuuu) chain installable and guard it ([#7389](https://github.com/tutur3u/platform/issues/7389)) ([b1378ab](https://github.com/tutur3u/platform/commit/b1378abcaa31c02b5861cc16e6aa6bb2f8789c3c))
* **tasks:** align board access and realtime delivery ([#7016](https://github.com/tutur3u/platform/issues/7016)) ([70aef15](https://github.com/tutur3u/platform/commit/70aef1546bf600aaa29fc046a915fc7c69be4d02))


### Performance Improvements

* **ai:** cut Mira time to first token ([#6725](https://github.com/tutur3u/platform/issues/6725)) ([192ce93](https://github.com/tutur3u/platform/commit/192ce93c5cf7d3cf38489d6be97ab589e271778a))
</details>

<details><summary>apis: 0.13.2</summary>

## [0.13.2](https://github.com/tutur3u/platform/compare/apis-v0.13.1...apis-v0.13.2) (2026-11-04)


### Bug Fixes

* **api:** align user group workspace scoping ([#7001](https://github.com/tutur3u/platform/issues/7001)) ([7c7ec6e](https://github.com/tutur3u/platform/commit/7c7ec6ea248d9a3fdb7aabf9e64fbda1933ad321))
* **auth:** scope challenge and participant management ([#7026](https://github.com/tutur3u/platform/issues/7026)) ([0991afe](https://github.com/tutur3u/platform/commit/0991afedb1757203fb4d95496e2cc034df6aa4fc))
* **finance:** align workspace scoping for finance routes ([#7029](https://github.com/tutur3u/platform/issues/7029)) ([2ba27b9](https://github.com/tutur3u/platform/commit/2ba27b96035bbd43288b6c3de1e9ca9909b9243a))
* **finance:** scope categories and transaction access to the workspace ([#7150](https://github.com/tutur3u/platform/issues/7150)) ([f08c4ea](https://github.com/tutur3u/platform/commit/f08c4ead35be9b81465de2505121de003285f651))
* **meet:** align guest and poll plan access ([#7010](https://github.com/tutur3u/platform/issues/7010)) ([3848203](https://github.com/tutur3u/platform/commit/38482031cb31370266617da264d71bea61a48acb))
* **meet:** apply anonymous plan access to guest availability writes ([#7064](https://github.com/tutur3u/platform/issues/7064)) ([019d52d](https://github.com/tutur3u/platform/commit/019d52d2f27f2c37c96ca967ff9edc56d12e00c8))
* **meet:** apply anonymous plan access to guest availability writes. ([019d52d](https://github.com/tutur3u/platform/commit/019d52d2f27f2c37c96ca967ff9edc56d12e00c8))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **members:** normalize targets before access changes ([#7005](https://github.com/tutur3u/platform/issues/7005)) ([9d870f6](https://github.com/tutur3u/platform/commit/9d870f62769d8941695eff1ca07d68714abc171a))
* **packages:** make the published [@tuturuuu](https://github.com/tuturuuu) chain installable and guard it ([#7389](https://github.com/tutur3u/platform/issues/7389)) ([b1378ab](https://github.com/tutur3u/platform/commit/b1378abcaa31c02b5861cc16e6aa6bb2f8789c3c))
* restore main type check (meet fixture, track request routes) ([#7232](https://github.com/tutur3u/platform/issues/7232)) ([4fa1436](https://github.com/tutur3u/platform/commit/4fa143673a92161f31b4c300f774ebcbbdef468f))
</details>

<details><summary>auth: 0.8.0</summary>

## [0.8.0](https://github.com/tutur3u/platform/compare/auth-v0.7.0...auth-v0.8.0) (2026-11-04)


### Features

* **auth:** guard staging cookie scope with explicit deploy environment ([#7315](https://github.com/tutur3u/platform/issues/7315)) ([25c85aa](https://github.com/tutur3u/platform/commit/25c85aa8b0e9b08a03aace0cab90aaa75ebd6bfd))


### Bug Fixes

* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** scope the managed login shortcut to the configured shared cookie domain ([#7051](https://github.com/tutur3u/platform/issues/7051)) ([0f7d9e6](https://github.com/tutur3u/platform/commit/0f7d9e6f0bf96b41b48dd920015c309ff41dee82))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **e2e:** collect Playwright specs and keep shared localhost sessions ([#7163](https://github.com/tutur3u/platform/issues/7163)) ([35b2963](https://github.com/tutur3u/platform/commit/35b2963c77ddc5207f6fa778f9d40dc997af2a50))
* **security:** stop trusting the expired rewise.me origin ([#7413](https://github.com/tutur3u/platform/issues/7413)) ([c8f3530](https://github.com/tutur3u/platform/commit/c8f3530fee7bdaa3a86fc23caaafa23112955ee0))


### Performance Improvements

* **auth:** verify the request user once across refresh, guard and MFA ([#7153](https://github.com/tutur3u/platform/issues/7153)) ([959206e](https://github.com/tutur3u/platform/commit/959206efa1b1b686c75a1d17eade931519e8729f))
</details>

<details><summary>education-core: 0.5.1</summary>

## [0.5.1](https://github.com/tutur3u/platform/compare/education-core-v0.5.0...education-core-v0.5.1) (2026-11-04)


### Bug Fixes

* **learn:** require parent consent for Tulearn parent links (SR-238) ([#7062](https://github.com/tutur3u/platform/issues/7062)) ([b085a0e](https://github.com/tutur3u/platform/commit/b085a0e331aa758fd1e8f490df284b6bf22ed63a))
* **teach:** enforce page-level workspace membership ([#7098](https://github.com/tutur3u/platform/issues/7098)) ([77f5869](https://github.com/tutur3u/platform/commit/77f58694876e8320dcf38789f4b0ba2c5725589a))
* **tulearn:** interim, parents see no periodic reports (fail-closed) ([#7539](https://github.com/tutur3u/platform/issues/7539)) ([b3b1e48](https://github.com/tutur3u/platform/commit/b3b1e483cc6922ee0fd8480ab43847833c93316b))
* **tulearn:** parents see only approved, sent periodic reports ([#7547](https://github.com/tutur3u/platform/issues/7547)) ([487b501](https://github.com/tutur3u/platform/commit/487b5019de6b13be2cf05ead19461062355332fe))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
</details>

<details><summary>payment-core: 0.6.2</summary>

## [0.6.2](https://github.com/tutur3u/platform/compare/payment-core-v0.6.1...payment-core-v0.6.2) (2026-11-04)


### Bug Fixes

* **billing:** abort deletion when subscription cleanup fails ([#7373](https://github.com/tutur3u/platform/issues/7373)) ([e3ef4d3](https://github.com/tutur3u/platform/commit/e3ef4d31a2a1bc18c15a9e4d6048811afbd226f3))
</details>

<details><summary>internal-api: 0.56.0</summary>

## [0.56.0](https://github.com/tutur3u/platform/compare/internal-api-v0.55.0...internal-api-v0.56.0) (2026-11-04)


### Features

* **contacts:** add tutoring teacher công report ([#7297](https://github.com/tutur3u/platform/issues/7297)) ([770665b](https://github.com/tutur3u/platform/commit/770665b7303ead6264845c9e7679f09cb09c169e))
* **contacts:** monthly GVNN schedule editor with month clone ([#6927](https://github.com/tutur3u/platform/issues/6927)) ([13c4e0b](https://github.com/tutur3u/platform/commit/13c4e0b43cdc20a4566187386a8eecf21157a79b))
* **meet:** fail-closed per-user Meet AI limiter ([#7417](https://github.com/tutur3u/platform/issues/7417)) ([fca5cb0](https://github.com/tutur3u/platform/commit/fca5cb0b31a5966bab2d8fe16b9d0c8f2f7986fe))
* **meet:** gate Meet AI behind a default-deny workspace allowlist ([#7354](https://github.com/tutur3u/platform/issues/7354)) ([c1ec761](https://github.com/tutur3u/platform/commit/c1ec761dedcdd01041e4b6b82f53aa62f001655f))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
* **tutoring:** add workspace campus list and announcement place picker ([#7049](https://github.com/tutur3u/platform/issues/7049)) ([9ae0a76](https://github.com/tutur3u/platform/commit/9ae0a76828670c29cbdce07638d0213324453a6d))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([5b52e01](https://github.com/tutur3u/platform/commit/5b52e018e1789d47ea2fbab7d85be3a3ec48e4cc))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([9eb14a6](https://github.com/tutur3u/platform/commit/9eb14a6c62076e5f59d5f412a504833e58a81bb6))
* **tutoring:** tutor groups for the policy, teacher picker and queues ([#7054](https://github.com/tutur3u/platform/issues/7054)) ([5298df0](https://github.com/tutur3u/platform/commit/5298df043e186f242d660b018d0003f608ec04a8))


### Bug Fixes

* **ai:** require workspace access for meeting transcription ([#7357](https://github.com/tutur3u/platform/issues/7357)) ([c2763ae](https://github.com/tutur3u/platform/commit/c2763aeb66c094982c3bf8fa83d5b2da6d5cc3a5))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **contacts:** GVNN schedule notify teachers, swap race and unsaved-changes guard ([#6966](https://github.com/tutur3u/platform/issues/6966)) ([429bcb3](https://github.com/tutur3u/platform/commit/429bcb30bb03f082c523e8f06c5f3b8c493ac2f4))
* **drive:** expire and revoke export links ([#7140](https://github.com/tutur3u/platform/issues/7140)) ([307f08f](https://github.com/tutur3u/platform/commit/307f08fee6ded7b19fe61901390afa45c33d5dce))
* **education:** scope learner and teacher resource access ([#7017](https://github.com/tutur3u/platform/issues/7017)) ([5942601](https://github.com/tutur3u/platform/commit/59426011aafb60ec51da42f6feb95872834acc60))
* **learn:** require parent consent for Tulearn parent links (SR-238) ([#7062](https://github.com/tutur3u/platform/issues/7062)) ([b085a0e](https://github.com/tutur3u/platform/commit/b085a0e331aa758fd1e8f490df284b6bf22ed63a))
* **meet:** bill Meet AI to the meeting workspace's AI credits ([#7408](https://github.com/tutur3u/platform/issues/7408)) ([0f8b6dc](https://github.com/tutur3u/platform/commit/0f8b6dcac84f7b29d4c6a15e574330d7b3ad4349))
* **reports:** monthly report summary counts on first load ([#7527](https://github.com/tutur3u/platform/issues/7527)) ([72d124e](https://github.com/tutur3u/platform/commit/72d124ebf98fc35d91a902c8be4787216c0803ae))
* **security:** stop trusting the expired rewise.me origin ([#7413](https://github.com/tutur3u/platform/issues/7413)) ([c8f3530](https://github.com/tutur3u/platform/commit/c8f3530fee7bdaa3a86fc23caaafa23112955ee0))
* **storage:** own upload budget for workspace-managed user avatars ([#7289](https://github.com/tutur3u/platform/issues/7289)) ([25f6903](https://github.com/tutur3u/platform/commit/25f69034808c5aaf26493b9c27cc2f9fe3f75087))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([16e8ff6](https://github.com/tutur3u/platform/commit/16e8ff65880be827c4c2dc03e7cc186b0b2c7724))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([f913a3c](https://github.com/tutur3u/platform/commit/f913a3c012ba38211e05c6a98692e8d1c7ccc04a))
* **tutoring:** let one teacher tutor many learners in a shared slot ([#7255](https://github.com/tutur3u/platform/issues/7255)) ([daf6835](https://github.com/tutur3u/platform/commit/daf6835daade9216a16efc177a4e8dab6ab0919e))
* **tutoring:** list learners under current classes and needs-tutoring groups ([#7257](https://github.com/tutur3u/platform/issues/7257)) ([07c85f4](https://github.com/tutur3u/platform/commit/07c85f41c16c9ac86ea3afa5710c93bf934454b0))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([f029cf6](https://github.com/tutur3u/platform/commit/f029cf6dad6ef202ddd43aefdc15014dbb9eb4bc))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **tutoring:** teach the right content for absent, weak and both rows. ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **workspace:** surface deletion failures and preserve confirmation ([#6969](https://github.com/tutur3u/platform/issues/6969)) ([a6af584](https://github.com/tutur3u/platform/commit/a6af584903a4741934e023776d90bc50667c1a33))
</details>

<details><summary>inventory-core: 0.11.2</summary>

## [0.11.2](https://github.com/tutur3u/platform/compare/inventory-core-v0.11.1...inventory-core-v0.11.2) (2026-11-04)


### Bug Fixes

* **groups:** align group and member access checks ([#7028](https://github.com/tutur3u/platform/issues/7028)) ([6fa6453](https://github.com/tutur3u/platform/commit/6fa6453a9b76559fdac74fe6727c71348b090307))
* restore main type check (meet fixture, track request routes) ([#7232](https://github.com/tutur3u/platform/issues/7232)) ([4fa1436](https://github.com/tutur3u/platform/commit/4fa143673a92161f31b4c300f774ebcbbdef468f))
</details>

<details><summary>legal: 0.4.0</summary>

## [0.4.0](https://github.com/tutur3u/platform/compare/legal-v0.3.1...legal-v0.4.0) (2026-11-04)


### Features

* **legal:** redesign What changed with a gated bilingual notice ([#7228](https://github.com/tutur3u/platform/issues/7228)) ([e92a6e4](https://github.com/tutur3u/platform/commit/e92a6e4682fbbf266ec51eff26d91a3309ad6d0a))


### Bug Fixes

* **legal:** keep safety rules in the proposed AUP and community policies ([#7226](https://github.com/tutur3u/platform/issues/7226)) ([8ffeeef](https://github.com/tutur3u/platform/commit/8ffeeef8bc996b1997a46047e322f86885438c6c))
* **legal:** restore the in-force legal documents and separate proposed changes ([#7220](https://github.com/tutur3u/platform/issues/7220)) ([e035fa9](https://github.com/tutur3u/platform/commit/e035fa9c54d79b7766cd8d4c053b2f739d4d0ff4))
* **legal:** restore the in-force legal documents and separate proposed changes ([#7220](https://github.com/tutur3u/platform/issues/7220)) ([aba1e25](https://github.com/tutur3u/platform/commit/aba1e250d7bcd08ae2ead0417e6816f8c97d2ae6))
</details>

<details><summary>payment: 0.4.3</summary>

## [0.4.3](https://github.com/tutur3u/platform/compare/payment-v0.4.2...payment-v0.4.3) (2026-11-04)


### Bug Fixes

* **billing:** abort deletion when subscription cleanup fails ([#7373](https://github.com/tutur3u/platform/issues/7373)) ([e3ef4d3](https://github.com/tutur3u/platform/commit/e3ef4d31a2a1bc18c15a9e4d6048811afbd226f3))
</details>

<details><summary>realtime: 0.11.0</summary>

## [0.11.0](https://github.com/tutur3u/platform/compare/realtime-v0.10.2...realtime-v0.11.0) (2026-11-04)


### Features

* **meet:** add transcription state and consent protocol ([#7266](https://github.com/tutur3u/platform/issues/7266)) ([2d601a1](https://github.com/tutur3u/platform/commit/2d601a1620cc8d39d425abb0617774c6eb2184bf))
* **meet:** default-allow Meet AI with a kill switch ([#7410](https://github.com/tutur3u/platform/issues/7410)) ([a96f160](https://github.com/tutur3u/platform/commit/a96f1609656bed08678af0dd1fb828711af4278a))
* **meet:** gate Meet AI behind a default-deny workspace allowlist ([#7354](https://github.com/tutur3u/platform/issues/7354)) ([c1ec761](https://github.com/tutur3u/platform/commit/c1ec761dedcdd01041e4b6b82f53aa62f001655f))


### Bug Fixes

* **packages:** make the published [@tuturuuu](https://github.com/tuturuuu) chain installable and guard it ([#7389](https://github.com/tutur3u/platform/issues/7389)) ([b1378ab](https://github.com/tutur3u/platform/commit/b1378abcaa31c02b5861cc16e6aa6bb2f8789c3c))
</details>

<details><summary>satellite: 0.27.0</summary>

## [0.27.0](https://github.com/tutur3u/platform/compare/satellite-v0.26.0...satellite-v0.27.0) (2026-11-04)


### Features

* **perf:** measure app switches for the one-origin rollout ([#6756](https://github.com/tutur3u/platform/issues/6756)) ([893f041](https://github.com/tutur3u/platform/commit/893f041e9b242a490a5a4abfa5de86adcd574a12))


### Bug Fixes

* **ui:** start satellite sidebar closed on mobile ([#7161](https://github.com/tutur3u/platform/issues/7161)) ([d1f4824](https://github.com/tutur3u/platform/commit/d1f482417c36bdf0c0bd179e2a7af6a63537b968))
</details>

<details><summary>sdk: 0.29.1</summary>

## [0.29.1](https://github.com/tutur3u/platform/compare/sdk-v0.29.0...sdk-v0.29.1) (2026-11-04)


### Bug Fixes

* **sdk:** approve storage export links portable source ([#7154](https://github.com/tutur3u/platform/issues/7154)) ([8b60602](https://github.com/tutur3u/platform/commit/8b60602fd58b894a6bc5af3db8920676da1183ec))
</details>

<details><summary>storage-core: 0.4.0</summary>

## [0.4.0](https://github.com/tutur3u/platform/compare/storage-core-v0.3.3...storage-core-v0.4.0) (2026-11-04)


### Features

* **storage:** app-side storage access audit log ([#6891](https://github.com/tutur3u/platform/issues/6891)) ([57cc3f1](https://github.com/tutur3u/platform/commit/57cc3f1750a94890f55a9b33496a1694c11c1888))


### Bug Fixes

* **drive:** expire and revoke export links ([#7140](https://github.com/tutur3u/platform/issues/7140)) ([307f08f](https://github.com/tutur3u/platform/commit/307f08fee6ded7b19fe61901390afa45c33d5dce))
* **packages:** make the published [@tuturuuu](https://github.com/tuturuuu) chain installable and guard it ([#7389](https://github.com/tutur3u/platform/issues/7389)) ([b1378ab](https://github.com/tutur3u/platform/commit/b1378abcaa31c02b5861cc16e6aa6bb2f8789c3c))
* **storage:** match Drive private roots case-insensitively ([#7084](https://github.com/tutur3u/platform/issues/7084)) ([85b61bb](https://github.com/tutur3u/platform/commit/85b61bb064adb66876fd9e993b8e8f0617fa5f25))
* **storage:** own upload budget for workspace-managed user avatars ([#7289](https://github.com/tutur3u/platform/issues/7289)) ([25f6903](https://github.com/tutur3u/platform/commit/25f69034808c5aaf26493b9c27cc2f9fe3f75087))
</details>

<details><summary>supabase: 0.7.0</summary>

## [0.7.0](https://github.com/tutur3u/platform/compare/supabase-v0.6.0...supabase-v0.7.0) (2026-11-04)


### Features

* **auth:** guard staging cookie scope with explicit deploy environment ([#7315](https://github.com/tutur3u/platform/issues/7315)) ([25c85aa](https://github.com/tutur3u/platform/commit/25c85aa8b0e9b08a03aace0cab90aaa75ebd6bfd))
* **drive:** add staging Start candidate ([#7085](https://github.com/tutur3u/platform/issues/7085)) ([a211868](https://github.com/tutur3u/platform/commit/a2118681d88fa5073b6b7421e9357824505650b0))


### Bug Fixes

* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** reject conflicting staging cookie signals ([#7316](https://github.com/tutur3u/platform/issues/7316)) ([bfc41ce](https://github.com/tutur3u/platform/commit/bfc41ce8f329130e077e6440c8424d44fc5e274e))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **auth:** scope the managed login shortcut to the configured shared cookie domain ([#7051](https://github.com/tutur3u/platform/issues/7051)) ([0f7d9e6](https://github.com/tutur3u/platform/commit/0f7d9e6f0bf96b41b48dd920015c309ff41dee82))
</details>

<details><summary>tasks-api: 0.5.3</summary>

## [0.5.3](https://github.com/tutur3u/platform/compare/tasks-api-v0.5.2...tasks-api-v0.5.3) (2026-11-04)


### Bug Fixes

* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **tasks:** align board access and realtime delivery ([#7016](https://github.com/tutur3u/platform/issues/7016)) ([70aef15](https://github.com/tutur3u/platform/commit/70aef1546bf600aaa29fc046a915fc7c69be4d02))
</details>

<details><summary>tasks-ui: 0.18.0</summary>

## [0.18.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.17.3...tasks-ui-v0.18.0) (2026-11-04)


### Features

* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))


### Bug Fixes

* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **tasks:** align board access and realtime delivery ([#7016](https://github.com/tutur3u/platform/issues/7016)) ([70aef15](https://github.com/tutur3u/platform/commit/70aef1546bf600aaa29fc046a915fc7c69be4d02))
</details>

<details><summary>turnstile: 0.2.1</summary>

## [0.2.1](https://github.com/tutur3u/platform/compare/turnstile-v0.2.0...turnstile-v0.2.1) (2026-11-04)


### Bug Fixes

* **packages:** make the published [@tuturuuu](https://github.com/tuturuuu) chain installable and guard it ([#7389](https://github.com/tutur3u/platform/issues/7389)) ([b1378ab](https://github.com/tutur3u/platform/commit/b1378abcaa31c02b5861cc16e6aa6bb2f8789c3c))
</details>

<details><summary>types: 0.38.0</summary>

## [0.38.0](https://github.com/tutur3u/platform/compare/types-v0.37.0...types-v0.38.0) (2026-11-04)


### Features

* **ai:** create Mira chat with the first message ([#6765](https://github.com/tutur3u/platform/issues/6765)) ([aae4d08](https://github.com/tutur3u/platform/commit/aae4d088b0225d428bce41153bac7cf204d5a8dd))
* **database:** add topic teacher deadline notice types and receipts ([#6975](https://github.com/tutur3u/platform/issues/6975)) ([ee987de](https://github.com/tutur3u/platform/commit/ee987dec1d739c81a8d5eeda0502aa2c436249bf))
* **database:** tutoring automation foundation ([#7254](https://github.com/tutur3u/platform/issues/7254)) ([dcc7d73](https://github.com/tutur3u/platform/commit/dcc7d73e488cabedda8874803201ce5c69e57b7f))
* **mastermind:** add the Inbox ask card and accept the new hub fields ([#7395](https://github.com/tutur3u/platform/issues/7395)) ([fe316e8](https://github.com/tutur3u/platform/commit/fe316e8f95f3e569e26be81faac9fef56c8f8a1f))
* **mastermind:** add the Inbox ask-v2 contract and shared fixture ([#7390](https://github.com/tutur3u/platform/issues/7390)) ([3371d16](https://github.com/tutur3u/platform/commit/3371d16e41c65551939195fb8e2cdcdfb71ccdcf))


### Bug Fixes

* **database:** restrict remaining privileged definer functions ([#7092](https://github.com/tutur3u/platform/issues/7092)) ([5743c29](https://github.com/tutur3u/platform/commit/5743c290cfccc7c9250f1c9e6027c3318482df74))
* **database:** scope Discord mappings to the linked workspace ([#7014](https://github.com/tutur3u/platform/issues/7014)) ([cc59d0b](https://github.com/tutur3u/platform/commit/cc59d0ba1527509297ec18ac6a1d559991f1fe64))
* **db:** consolidate has_workspace_permission and add manage_mastermind ([#7302](https://github.com/tutur3u/platform/issues/7302)) ([29ef37b](https://github.com/tutur3u/platform/commit/29ef37bf1f47571ade70b0ab3ba879554fa5aa79))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **mobile:** manage workspace visibility and filter Home choices ([#6978](https://github.com/tutur3u/platform/issues/6978)) ([8d625ae](https://github.com/tutur3u/platform/commit/8d625ae0a791b16db681a9ce238c66d0a8194003))
* **permissions:** keep role workspace ownership consistent ([#7206](https://github.com/tutur3u/platform/issues/7206)) ([bcd7671](https://github.com/tutur3u/platform/commit/bcd76715785fb17e703e934c3e2b36e672222647))
</details>

<details><summary>ui: 0.41.0</summary>

## [0.41.0](https://github.com/tutur3u/platform/compare/ui-v0.40.0...ui-v0.41.0) (2026-11-04)


### Features

* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **contacts:** GVNN schedule notify teachers, swap race and unsaved-changes guard ([#6966](https://github.com/tutur3u/platform/issues/6966)) ([429bcb3](https://github.com/tutur3u/platform/commit/429bcb30bb03f082c523e8f06c5f3b8c493ac2f4))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **mobile:** manage workspace visibility and filter Home choices ([#6978](https://github.com/tutur3u/platform/issues/6978)) ([8d625ae](https://github.com/tutur3u/platform/commit/8d625ae0a791b16db681a9ce238c66d0a8194003))
* **packages:** make the published [@tuturuuu](https://github.com/tuturuuu) chain installable and guard it ([#7389](https://github.com/tutur3u/platform/issues/7389)) ([b1378ab](https://github.com/tutur3u/platform/commit/b1378abcaa31c02b5861cc16e6aa6bb2f8789c3c))
* **ui:** increase light muted foreground contrast ([#7219](https://github.com/tutur3u/platform/issues/7219)) ([e1870dd](https://github.com/tutur3u/platform/commit/e1870dd454293ab614dc636d6ecaba00e84c10dc))
* **ui:** start satellite sidebar closed on mobile ([#7161](https://github.com/tutur3u/platform/issues/7161)) ([d1f4824](https://github.com/tutur3u/platform/commit/d1f482417c36bdf0c0bd179e2a7af6a63537b968))
* **users:** align workspace read permissions ([#7022](https://github.com/tutur3u/platform/issues/7022)) ([6d81393](https://github.com/tutur3u/platform/commit/6d8139370238d3be6455724c7e71bd296004002e))
* **utils:** resolve ambiguous DST wall times deterministically ([#7397](https://github.com/tutur3u/platform/issues/7397)) ([523a09b](https://github.com/tutur3u/platform/commit/523a09b40567e89769fc6ab139c860ec7817e5cd))
</details>

<details><summary>users-core: 0.12.0</summary>

## [0.12.0](https://github.com/tutur3u/platform/compare/users-core-v0.11.2...users-core-v0.12.0) (2026-11-04)


### Features

* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **api:** align user group workspace scoping ([#7001](https://github.com/tutur3u/platform/issues/7001)) ([7c7ec6e](https://github.com/tutur3u/platform/commit/7c7ec6ea248d9a3fdb7aabf9e64fbda1933ad321))
* **api:** align workspace operation permissions and references ([#7033](https://github.com/tutur3u/platform/issues/7033)) ([86c6dd4](https://github.com/tutur3u/platform/commit/86c6dd4dd388a9081334293b0b0005452e846200))
* **groups:** align group and member access checks ([#7028](https://github.com/tutur3u/platform/issues/7028)) ([6fa6453](https://github.com/tutur3u/platform/commit/6fa6453a9b76559fdac74fe6727c71348b090307))
* **reports:** monthly report summary counts on first load ([#7527](https://github.com/tutur3u/platform/issues/7527)) ([72d124e](https://github.com/tutur3u/platform/commit/72d124ebf98fc35d91a902c8be4787216c0803ae))
* **storage:** own upload budget for workspace-managed user avatars ([#7289](https://github.com/tutur3u/platform/issues/7289)) ([25f6903](https://github.com/tutur3u/platform/commit/25f69034808c5aaf26493b9c27cc2f9fe3f75087))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **users:** align approval and post delivery scoping ([#6989](https://github.com/tutur3u/platform/issues/6989)) ([d1a7052](https://github.com/tutur3u/platform/commit/d1a7052c247e19467cbff8aa60c8c06dbb46e91d))
* **users:** align workspace read permissions ([#7022](https://github.com/tutur3u/platform/issues/7022)) ([6d81393](https://github.com/tutur3u/platform/commit/6d8139370238d3be6455724c7e71bd296004002e))
* **users:** scope report delivery preview and send to the report's group ([#7061](https://github.com/tutur3u/platform/issues/7061)) ([f85a01e](https://github.com/tutur3u/platform/commit/f85a01ecfe0c67f0fdcd23fc89faa7530d31ce43))
* **users:** tighten workspace read scoping and permissions ([#6979](https://github.com/tutur3u/platform/issues/6979)) ([f720f64](https://github.com/tutur3u/platform/commit/f720f64bc07ad85ec2e41c69d8ead1e342d9d802))
* **users:** validate group-check participants ([#6984](https://github.com/tutur3u/platform/issues/6984)) ([e992446](https://github.com/tutur3u/platform/commit/e9924465065e4c82b915eef194bd8c742fc9ed87))
</details>

<details><summary>utils: 0.39.0</summary>

## [0.39.0](https://github.com/tutur3u/platform/compare/utils-v0.38.1...utils-v0.39.0) (2026-11-04)


### Features

* **abuse-guard:** add Durable Object guard store Worker ([#6837](https://github.com/tutur3u/platform/issues/6837)) ([41970d1](https://github.com/tutur3u/platform/commit/41970d183e9120b7ed03ddc53d69301525b78a8a))
* **auth:** guard staging cookie scope with explicit deploy environment ([#7315](https://github.com/tutur3u/platform/issues/7315)) ([25c85aa](https://github.com/tutur3u/platform/commit/25c85aa8b0e9b08a03aace0cab90aaa75ebd6bfd))
* **calendar:** split staging and production hosts and verify Access on staging ([#7318](https://github.com/tutur3u/platform/issues/7318)) ([e1f9a4c](https://github.com/tutur3u/platform/commit/e1f9a4c69f948c9a458b4adc15f01d6e82807ea4))
* **contacts:** add default-off Start candidate ([#7120](https://github.com/tutur3u/platform/issues/7120)) ([9a7795d](https://github.com/tutur3u/platform/commit/9a7795d2036bb1be9c346b3461abeef8f4eb0642))
* **contacts:** monthly GVNN schedule editor with month clone ([#6927](https://github.com/tutur3u/platform/issues/6927)) ([13c4e0b](https://github.com/tutur3u/platform/commit/13c4e0b43cdc20a4566187386a8eecf21157a79b))
* **mastermind:** gate access on an explicit manage_mastermind grant ([#7158](https://github.com/tutur3u/platform/issues/7158)) ([3a886df](https://github.com/tutur3u/platform/commit/3a886dfca89d496fdaaa91c1d333603016cd364d))
* **meet:** fail-closed per-user Meet AI limiter ([#7417](https://github.com/tutur3u/platform/issues/7417)) ([fca5cb0](https://github.com/tutur3u/platform/commit/fca5cb0b31a5966bab2d8fe16b9d0c8f2f7986fe))
* **perf:** measure app switches for the one-origin rollout ([#6756](https://github.com/tutur3u/platform/issues/6756)) ([893f041](https://github.com/tutur3u/platform/commit/893f041e9b242a490a5a4abfa5de86adcd574a12))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([5b52e01](https://github.com/tutur3u/platform/commit/5b52e018e1789d47ea2fbab7d85be3a3ec48e4cc))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([9eb14a6](https://github.com/tutur3u/platform/commit/9eb14a6c62076e5f59d5f412a504833e58a81bb6))
* **utils:** add abuse-guard store protocol and clients ([#6834](https://github.com/tutur3u/platform/issues/6834)) ([22b79b6](https://github.com/tutur3u/platform/commit/22b79b62be0fe486e66f1a0a2420b4b58449bf87))
* **utils:** atomic password reservations on the abuse-guard store ([#6852](https://github.com/tutur3u/platform/issues/6852)) ([bd55672](https://github.com/tutur3u/platform/commit/bd55672054633e8cf6801b24747b63b30d4967dc))
* **utils:** route offline, proxy and replay guards through the abuse-guard store ([#6845](https://github.com/tutur3u/platform/issues/6845)) ([ceb59e3](https://github.com/tutur3u/platform/commit/ceb59e3fc6bbdd3451b2b94cf195c6bbec4077ab))
* **web:** add signed Mastermind push-events route ([#7133](https://github.com/tutur3u/platform/issues/7133)) ([8416d3c](https://github.com/tutur3u/platform/commit/8416d3cb54dced26149d0d82316739cd2842fcfa))
* **web:** harden the staging issuer Worker and its protected Next fallback ([#7319](https://github.com/tutur3u/platform/issues/7319)) ([cb5292d](https://github.com/tutur3u/platform/commit/cb5292dc5fc90c10b2af9e9a241905c3c6f5de99))
* **web:** render public legal pages in Start staging candidate ([#7102](https://github.com/tutur3u/platform/issues/7102)) ([7f2f1d7](https://github.com/tutur3u/platform/commit/7f2f1d7923d08751d15b63cacc0a7ee3451f32eb))


### Bug Fixes

* **abuse-guard:** enforce durable command fairness ([#6865](https://github.com/tutur3u/platform/issues/6865)) ([1c44022](https://github.com/tutur3u/platform/commit/1c440227fb512187bb98dddf00b92c7127078e04))
* align main unit fixtures with authorization and app inventory ([#7265](https://github.com/tutur3u/platform/issues/7265)) ([0eb1e3a](https://github.com/tutur3u/platform/commit/0eb1e3a8d350c5179bfaad63fc7281bfd47ebbf8))
* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **auth:** reject conflicting staging cookie signals ([#7316](https://github.com/tutur3u/platform/issues/7316)) ([bfc41ce](https://github.com/tutur3u/platform/commit/bfc41ce8f329130e077e6440c8424d44fc5e274e))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **auth:** scope the managed login shortcut to the configured shared cookie domain ([#7051](https://github.com/tutur3u/platform/issues/7051)) ([0f7d9e6](https://github.com/tutur3u/platform/commit/0f7d9e6f0bf96b41b48dd920015c309ff41dee82))
* **ci:** enforce migration policies and PR credential boundaries ([#7034](https://github.com/tutur3u/platform/issues/7034)) ([5921faf](https://github.com/tutur3u/platform/commit/5921faf143b1b11c1bf07a79f9984e7545054dbe))
* **db:** consolidate has_workspace_permission and add manage_mastermind ([#7302](https://github.com/tutur3u/platform/issues/7302)) ([29ef37b](https://github.com/tutur3u/platform/commit/29ef37bf1f47571ade70b0ab3ba879554fa5aa79))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **infra:** require platform admin for workspace secrets ([#7174](https://github.com/tutur3u/platform/issues/7174)) ([496de2e](https://github.com/tutur3u/platform/commit/496de2ef9c819ec73e647e395e80f494a3c696c9))
* **integrations:** align AI and project request authorization ([#7012](https://github.com/tutur3u/platform/issues/7012)) ([606e882](https://github.com/tutur3u/platform/commit/606e882bb3c44f39eb7277f4a9701acc492a025b))
* **packages:** make the published [@tuturuuu](https://github.com/tuturuuu) chain installable and guard it ([#7389](https://github.com/tutur3u/platform/issues/7389)) ([b1378ab](https://github.com/tutur3u/platform/commit/b1378abcaa31c02b5861cc16e6aa6bb2f8789c3c))
* **playground:** require a signed-in staff session for AI routes and pages ([#7215](https://github.com/tutur3u/platform/issues/7215)) ([e4e42e0](https://github.com/tutur3u/platform/commit/e4e42e06ca651b9838e06248f9ad4add952768d0))
* **roles:** scope role permission updates to the role's workspace ([#6995](https://github.com/tutur3u/platform/issues/6995)) ([010f0f2](https://github.com/tutur3u/platform/commit/010f0f228acf8acbb095f2a6020eac414deac5d6))
* **security:** harden staging-host guard and restore reserved-host handling ([#7256](https://github.com/tutur3u/platform/issues/7256)) ([077e48c](https://github.com/tutur3u/platform/commit/077e48c3ecea2841d4c99c9d848122ef1827dd42))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **security:** stop trusting the expired rewise.me origin ([#7413](https://github.com/tutur3u/platform/issues/7413)) ([c8f3530](https://github.com/tutur3u/platform/commit/c8f3530fee7bdaa3a86fc23caaafa23112955ee0))
* **security:** validate project branches and strip guard comments ([#7271](https://github.com/tutur3u/platform/issues/7271)) ([d718355](https://github.com/tutur3u/platform/commit/d718355c2d86bb875e835326f7744b9832673839))
* **tasks:** align board access and realtime delivery ([#7016](https://github.com/tutur3u/platform/issues/7016)) ([70aef15](https://github.com/tutur3u/platform/commit/70aef1546bf600aaa29fc046a915fc7c69be4d02))
* **time-tracking:** validate request task, category and linked-session scope ([#7068](https://github.com/tutur3u/platform/issues/7068)) ([716b49f](https://github.com/tutur3u/platform/commit/716b49f97999af4df1f20cc97214385e6e3f4f7d))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([f029cf6](https://github.com/tutur3u/platform/commit/f029cf6dad6ef202ddd43aefdc15014dbb9eb4bc))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **tutoring:** teach the right content for absent, weak and both rows. ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **utils:** list the internal Mastermind app in commercial inventory ([#7327](https://github.com/tutur3u/platform/issues/7327)) ([d6da3f1](https://github.com/tutur3u/platform/commit/d6da3f178d0c7198dc7ad5367138724162367cce))
* **utils:** resolve ambiguous DST wall times deterministically ([#7397](https://github.com/tutur3u/platform/issues/7397)) ([523a09b](https://github.com/tutur3u/platform/commit/523a09b40567e89769fc6ab139c860ec7817e5cd))


### Performance Improvements

* **auth:** verify the request user once across refresh, guard and MFA ([#7153](https://github.com/tutur3u/platform/issues/7153)) ([959206e](https://github.com/tutur3u/platform/commit/959206efa1b1b686c75a1d17eade931519e8729f))
</details>

<details><summary>lettin: 1.7.0</summary>

## [1.7.0](https://github.com/tutur3u/platform/compare/lettin-v1.6.0...lettin-v1.7.0) (2026-11-04)


### Features

* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
</details>

<details><summary>parley: 1.6.0</summary>

## [1.6.0](https://github.com/tutur3u/platform/compare/parley-v1.5.0...parley-v1.6.0) (2026-11-04)


### Features

* **meet:** default-allow Meet AI with a kill switch ([#7410](https://github.com/tutur3u/platform/issues/7410)) ([a96f160](https://github.com/tutur3u/platform/commit/a96f1609656bed08678af0dd1fb828711af4278a))
* **meet:** gate Meet AI behind a default-deny workspace allowlist ([#7354](https://github.com/tutur3u/platform/issues/7354)) ([c1ec761](https://github.com/tutur3u/platform/commit/c1ec761dedcdd01041e4b6b82f53aa62f001655f))
* **meet:** limit transcript and notes reads to participants and admins ([#7293](https://github.com/tutur3u/platform/issues/7293)) ([ab3216d](https://github.com/tutur3u/platform/commit/ab3216dceaaed5483fa0debd90f091cb9473d06f))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **meet:** admit AI credits before reserving transcript chunks ([#7243](https://github.com/tutur3u/platform/issues/7243)) ([0826b0e](https://github.com/tutur3u/platform/commit/0826b0eeee62421c284f1edfb9e4454bb2d1d526))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
</details>

<details><summary>meet-core: 1.5.0</summary>

## [1.5.0](https://github.com/tutur3u/platform/compare/meet-core-v1.4.2...meet-core-v1.5.0) (2026-11-04)


### Features

* **meet:** add transcription state and consent protocol ([#7266](https://github.com/tutur3u/platform/issues/7266)) ([2d601a1](https://github.com/tutur3u/platform/commit/2d601a1620cc8d39d425abb0617774c6eb2184bf))
* **meet:** default-allow Meet AI with a kill switch ([#7410](https://github.com/tutur3u/platform/issues/7410)) ([a96f160](https://github.com/tutur3u/platform/commit/a96f1609656bed08678af0dd1fb828711af4278a))
* **meet:** fail-closed per-user Meet AI limiter ([#7417](https://github.com/tutur3u/platform/issues/7417)) ([fca5cb0](https://github.com/tutur3u/platform/commit/fca5cb0b31a5966bab2d8fe16b9d0c8f2f7986fe))
* **meet:** gate Meet AI behind a default-deny workspace allowlist ([#7354](https://github.com/tutur3u/platform/issues/7354)) ([c1ec761](https://github.com/tutur3u/platform/commit/c1ec761dedcdd01041e4b6b82f53aa62f001655f))
* **meet:** improve transcription quality and support solo meetings ([#7267](https://github.com/tutur3u/platform/issues/7267)) ([ecc5e53](https://github.com/tutur3u/platform/commit/ecc5e53bfa6423ddbd9aaf789e6779c551064eab))
* **meet:** limit transcript and notes reads to participants and admins ([#7293](https://github.com/tutur3u/platform/issues/7293)) ([ab3216d](https://github.com/tutur3u/platform/commit/ab3216dceaaed5483fa0debd90f091cb9473d06f))


### Bug Fixes

* **ai:** require workspace access for meeting transcription ([#7357](https://github.com/tutur3u/platform/issues/7357)) ([c2763ae](https://github.com/tutur3u/platform/commit/c2763aeb66c094982c3bf8fa83d5b2da6d5cc3a5))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **meet:** admit AI credits before reserving transcript chunks ([#7243](https://github.com/tutur3u/platform/issues/7243)) ([0826b0e](https://github.com/tutur3u/platform/commit/0826b0eeee62421c284f1edfb9e4454bb2d1d526))
* **meet:** bill Meet AI to the meeting workspace's AI credits ([#7408](https://github.com/tutur3u/platform/issues/7408)) ([0f8b6dc](https://github.com/tutur3u/platform/commit/0f8b6dcac84f7b29d4c6a15e574330d7b3ad4349))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).
# Changelog

## [1.12.0](https://github.com/tutur3u/platform/compare/database-v1.11.0...database-v1.12.0) (2026-06-29)


### Features

* **auth:** add email auth recovery override ([0debe1c](https://github.com/tutur3u/platform/commit/0debe1c71efb30bb51081cc3494a732975be0a86))
* **cli:** add task search ([b8ec86f](https://github.com/tutur3u/platform/commit/b8ec86ffd7bf401d32ac29f7c4db0ee60565b717))
* **external-apps:** add managed scheduler cron integration ([431ed1b](https://github.com/tutur3u/platform/commit/431ed1b41682ba41ef190455816e53e06e4d0039))
* **infrastructure:** add rate-limit appeals ([f1e50e9](https://github.com/tutur3u/platform/commit/f1e50e9fd805dca6c80da8daab60ed24199f24ab))
* **inventory:** add Square Terminal checkout ([0a3bd76](https://github.com/tutur3u/platform/commit/0a3bd7635cf9836a379d94851e1a303cec848457))
* **inventory:** store Square credentials per workspace ([e606f23](https://github.com/tutur3u/platform/commit/e606f2341c2684b1ef8a7b72900a056ff7b70469))
* **posts:** add queue diagnostics and observability ([744dcc9](https://github.com/tutur3u/platform/commit/744dcc95a19b0df466098769f42b9c819a439dcd))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))


### Bug Fixes

* **infrastructure:** recover cron runner via docker control ([d1f216d](https://github.com/tutur3u/platform/commit/d1f216d3ef7887dec066494d3f1816f607ce28fc))
* **inventory:** harden Square Terminal contracts ([547ce87](https://github.com/tutur3u/platform/commit/547ce87fba395493f1b0c0596e1155a6dad5672d))

## [1.11.0](https://github.com/tutur3u/platform/compare/database-v1.10.0...database-v1.11.0) (2026-06-26)


### Features

* **settings:** manage internal project bindings ([5347be6](https://github.com/tutur3u/platform/commit/5347be62b3913d29cc1048f76678ba40eacd02da))
* **tasks:** add task progress tracking ([4cffb0f](https://github.com/tutur3u/platform/commit/4cffb0f041d41e3868481068d64b9e3b85a0011a))
* **tasks:** stabilize shared board realtime collaboration ([6028caf](https://github.com/tutur3u/platform/commit/6028caf50432fd4dcebdaa5a59284e50972b1aa3))
* **web:** add managed workspace cron service ([453763e](https://github.com/tutur3u/platform/commit/453763ebce1028e4189f4f1cdf70d8db5a9331c0))


### Bug Fixes

* **web:** stop inactive post emails ([3d62e99](https://github.com/tutur3u/platform/commit/3d62e9952c4397b05f0a271386049f17e0045f7d))

## [1.10.0](https://github.com/tutur3u/platform/compare/database-v1.9.0...database-v1.10.0) (2026-06-24)


### Features

* add paragrph type ([1a45cbf](https://github.com/tutur3u/platform/commit/1a45cbfaf4d99af39236d837ecdb58f53cb80843))
* add test apge ([2d62fc8](https://github.com/tutur3u/platform/commit/2d62fc883379ad54e800e8555e40168de5327295))
* **calendar:** add configurable two-way sync ([76078d8](https://github.com/tutur3u/platform/commit/76078d865618b4970b430b08f0db7a1a8c30ffcb))
* implement teach test submission review and student question feedback ([11cb373](https://github.com/tutur3u/platform/commit/11cb3736d3c35c18f0ed341f807f5df5a5775c31))
* implement test score visibility control and add submission review functionality ([2ce0416](https://github.com/tutur3u/platform/commit/2ce0416d6f192f539a859e5b66d7b8333dbe7b63))
* **tasks:** add public board sharing ([b5a4a07](https://github.com/tutur3u/platform/commit/b5a4a0796dab947e8dca3970d6aa136a4863dd35))
* **tasks:** add shareable kanban task plans ([2de4e58](https://github.com/tutur3u/platform/commit/2de4e5819673e11b01cdc1f21c317f33dc196f56))


### Bug Fixes

* **ci:** refresh migration timestamps ([c2b1f63](https://github.com/tutur3u/platform/commit/c2b1f6360b159ed8ddf25a1956eb19e3303bbd1a))
* **database:** prevent task plan owner takeover ([e5b925b](https://github.com/tutur3u/platform/commit/e5b925b40ec88aecb789ac8302c3a5c8515c97db))
* **database:** use signed supabase cli binary ([3f35834](https://github.com/tutur3u/platform/commit/3f35834f638f9c29c3048ab5f5c0ca0331092c77))
* **inventory:** bind Polar webhook workspace ([0cadc2b](https://github.com/tutur3u/platform/commit/0cadc2bf2df8a6ac6add5459d8d38c92d4e24ee9))
* **teach:** address assessment generation review ([54cf837](https://github.com/tutur3u/platform/commit/54cf83731bb540d4f6bd6b3acf0c55564ce165d0))
* **teach:** address follow-up review comments ([8cdb9c0](https://github.com/tutur3u/platform/commit/8cdb9c0385fe0fd374cba3b6a30463ce94f4f340))
* **teach:** address test review follow-ups ([bfc6c12](https://github.com/tutur3u/platform/commit/bfc6c12eade212bf8775b78cc2853fd8b14601e7))

## [1.9.0](https://github.com/tutur3u/platform/compare/database-v1.8.0...database-v1.9.0) (2026-06-17)


### Features

* add tests ([1bd19e0](https://github.com/tutur3u/platform/commit/1bd19e0402a78084095dd523603aca6ee52418fc))
* create test ([c225f9d](https://github.com/tutur3u/platform/commit/c225f9d636a701397c43249131f35fbb36e284e4))
* create test page ([618fffa](https://github.com/tutur3u/platform/commit/618fffabeeedfa09d72cd877e2bfd9e806a05090))
* create test view for student ([40bdd08](https://github.com/tutur3u/platform/commit/40bdd08ca449c7e151b0beae6d27d60fb913fe51))
* **inventory:** fix Polar checkout currency, add 2-way product sync, cache + redesign storefront ([de2f6fd](https://github.com/tutur3u/platform/commit/de2f6fd6e06ce5242a150a35d3989798f52b9ee9))
* **inventory:** per-bundle Polar sync badges (parallel to listings) ([670845b](https://github.com/tutur3u/platform/commit/670845babbd2ffa7df3ddc7b608df8e6eb36070c))
* **inventory:** per-listing Polar sync badges on the Storefront panel ([b7aff6e](https://github.com/tutur3u/platform/commit/b7aff6e702278e0b9f3bce3b8137563c0c7d1aa9))
* **inventory:** per-storefront Polar environment + clearer checkout errors ([b30c2ed](https://github.com/tutur3u/platform/commit/b30c2eddced0d63ce47c857e8da4578fcf6151d1))
* **inventory:** per-variant SKUs + storefront cart, dialog & instant checkout ([9662b85](https://github.com/tutur3u/platform/commit/9662b8501bcab51033edde79b44991c8ba648a37))
* **inventory:** per-workspace Polar webhook ingestion + signature verification ([862b25a](https://github.com/tutur3u/platform/commit/862b25af444a56ef85c6a4e3dab7b91ae71438fe))
* **inventory:** store commerce money in minor units and harden Polar sync ([3f7ee1d](https://github.com/tutur3u/platform/commit/3f7ee1da9335732854037e7e79fca9d5d2a381d0))
* **tasks:** add per-board default list for new tasks ([2d1d308](https://github.com/tutur3u/platform/commit/2d1d3082422bdd4813accb258fee79b322ce647b))
* **users:** add no-auth mode for profile-completion links ([c97daee](https://github.com/tutur3u/platform/commit/c97daee7ee04a6d2585213c510dc3943943257d8))
* **web:** extend profile completion links ([e8585a3](https://github.com/tutur3u/platform/commit/e8585a390b4cc8ae44cd0a15e667ae0f94a52494))
* **web:** rate limits admin center ([fe61dc9](https://github.com/tutur3u/platform/commit/fe61dc933615466f6169a3db3a4a1840f705e80b))
* **web:** trust-gated per-session read limits and trusted-location uplift ([3e64c89](https://github.com/tutur3u/platform/commit/3e64c8929dbe7987ad83900620a25a9559fe1edf))


### Bug Fixes

* **database:** resolve audit-log actor for admin-driven post approvals ([85c94e4](https://github.com/tutur3u/platform/commit/85c94e48d7ad5d14651ddf7a146dceb121000ef8))
* **database:** restore task_history payload limit for large descriptions ([6f62d26](https://github.com/tutur3u/platform/commit/6f62d262abb1b71b7efa64b0843101c7d47ed70e))
* **database:** restrict habit tracker client writes ([52ffa64](https://github.com/tutur3u/platform/commit/52ffa645cd2585c160ac30fa4c20dcf1c2e86cba))
* **database:** restrict require attention rpc ([43ad4e8](https://github.com/tutur3u/platform/commit/43ad4e82dfcdd85b2f4fb5e52b5f70fb5ddf9789))
* **database:** restrict task history inserts ([1218c34](https://github.com/tutur3u/platform/commit/1218c34f671b68559d4c03355fec6d1ca45ffdc3))
* **database:** secure profile link stats view ([7f994cb](https://github.com/tutur3u/platform/commit/7f994cbf422ea04012dcf30f8419d90580925a16))
* **database:** validate Supabase project refs ([e783a57](https://github.com/tutur3u/platform/commit/e783a571d05379d4d89c0437b08aaae7a6eff5d0))
* **e2e:** avoid random interval seed failures ([a61394e](https://github.com/tutur3u/platform/commit/a61394ed9fefa302674629c0539940b1c5646162))
* **finance:** harden transaction enrichment ([eddd93b](https://github.com/tutur3u/platform/commit/eddd93bd11fb451a7fa5da2e4ab2892fad931ab5))
* **habits:** constrain latest stats rpc target ([6ab1e78](https://github.com/tutur3u/platform/commit/6ab1e78d1d7f0f3996e74e4b5ee7e1ed79ff7d8f))
* **inventory:** currency-correct Polar checkout products (fixes non-USD checkout) ([a26adbb](https://github.com/tutur3u/platform/commit/a26adbb20f142e57ec9bf0e50ea27b5f3cea401f))
* **live:** bound live session scopes ([ef2109c](https://github.com/tutur3u/platform/commit/ef2109ccedaff1c382682e68c5588609b0fdeab7))
* ording question ([f0c32a4](https://github.com/tutur3u/platform/commit/f0c32a4e3b7634c73b0b7cc9b9b05af83468549a))
* **tasks:** bound description chunk writes ([1060db8](https://github.com/tutur3u/platform/commit/1060db81f2451de5877281252f85946c25ce125e))
* **tasks:** preserve task list creator attribution ([1392f5c](https://github.com/tutur3u/platform/commit/1392f5c8f318a3ee3abb0a2328da342bbfd59fd8))
* **tasks:** secure cursor realtime channels ([a0ec120](https://github.com/tutur3u/platform/commit/a0ec120d912b7998fe43c90b675a09d0d3798dfe))
* **tasks:** secure realtime task channels ([6d98d16](https://github.com/tutur3u/platform/commit/6d98d16baa9ecf68bdd47ce3ce6dc1ff2e2bca84))
* **tasks:** secure realtime task channels ([03dc6d6](https://github.com/tutur3u/platform/commit/03dc6d66666d1d3ae422f91cb94285367a8c1071))
* **time-tracking:** bind session tasks to workspace ([cb36d31](https://github.com/tutur3u/platform/commit/cb36d31e3bac1405c708b9131aa2a1e3525fd3d5))
* **tulearn:** address course test review feedback ([52800c3](https://github.com/tutur3u/platform/commit/52800c389ddb190dad6d96789f293fd47a2ce118))
* **tulearn:** define course test rpc after columns ([78da28c](https://github.com/tutur3u/platform/commit/78da28cb3f4c676beaf9de298ae436789c8f9596))
* **tulearn:** harden course test persistence ([42b9fab](https://github.com/tutur3u/platform/commit/42b9fabc3a7bbc3ae63022e9d524901544c64d0e))
* **tulearn:** scope course test module reads ([a4c99fa](https://github.com/tutur3u/platform/commit/a4c99fa9da4839d09a9937462e232a0cba53c91a))
* **tulearn:** secure learner quiz submissions ([94afe79](https://github.com/tutur3u/platform/commit/94afe79e8b5c36bba8bd6d5c423faaf487d412d9))
* **web:** make free-tier subscription provisioning failures explicit ([e33c71f](https://github.com/tutur3u/platform/commit/e33c71fdc867ddea4e76e9a7e390aae8e1481c4b))
* **web:** stop new-workspace setup from trapping users on "Preparing Workspace" ([3f7ee1d](https://github.com/tutur3u/platform/commit/3f7ee1da9335732854037e7e79fca9d5d2a381d0))

## [1.8.0](https://github.com/tutur3u/platform/compare/database-v1.7.0...database-v1.8.0) (2026-06-15)


### Features

* **cms:** redesign for non-technical users with finance/inventory/storefront integrations ([3558bd5](https://github.com/tutur3u/platform/commit/3558bd588d3428f38370a95f58a8d0389d5bca0e))
* **infrastructure:** protect mobile deployment vault ([bea31f2](https://github.com/tutur3u/platform/commit/bea31f2f71de509c5bc5e1b154ba62928ecea9c6))
* **inventory:** book finance transaction when a storefront sale is paid ([d239274](https://github.com/tutur3u/platform/commit/d239274b764e92916ada5ec70ea15d511e17ba06))
* **inventory:** mirror coupons to Polar discounts + Polar setup runbook ([5e44968](https://github.com/tutur3u/platform/commit/5e4496841b283c3bfb5e15b1a86d401bcde26d34))
* **inventory:** upgrade storefront commerce ([ac43942](https://github.com/tutur3u/platform/commit/ac439426ec6d7abc25efbf7ef88468e32be3a46e))
* **web:** add external user profile-completion links ([0effeb8](https://github.com/tutur3u/platform/commit/0effeb860f999227f673a55212d2cfd0c822105a))


### Bug Fixes

* **finance:** stop pending invoices from intermittently failing to load ([c4a51b8](https://github.com/tutur3u/platform/commit/c4a51b89e3cad8130b8016864cf25f4da6db6fc1))
* **tasks:** persist large task descriptions in chunks ([457744a](https://github.com/tutur3u/platform/commit/457744aa051d06baccc5df5aa4d4cb509534ea8b))

## [1.7.0](https://github.com/tutur3u/platform/compare/database-v1.6.0...database-v1.7.0) (2026-06-13)


### Features

* **inventory:** add command center dashboard ([37ea5c5](https://github.com/tutur3u/platform/commit/37ea5c5e32c8be149a077269f246f4a369739f84))

## [1.6.0](https://github.com/tutur3u/platform/compare/database-v1.5.0...database-v1.6.0) (2026-06-13)


### Features

* **ci:** add GitHub bot check auto-pickup ([9e62daa](https://github.com/tutur3u/platform/commit/9e62daa5267b29ca5e55ed85c7d560415cef3b77))
* **finance:** add wallet checkpoint audit history ([11139c7](https://github.com/tutur3u/platform/commit/11139c7e354a8f29e83187748711f6ae39c48e70))
* **inventory:** add costing and simulated storefront checkout ([7fcdabb](https://github.com/tutur3u/platform/commit/7fcdabb145e6fa9cc899b563b117e65f7772643a))
* **inventory:** revamp storefront commerce experience ([72a2bde](https://github.com/tutur3u/platform/commit/72a2bde46a1e6c2815d0b2111fc743373c7bec9b))


### Bug Fixes

* **ci:** stabilize e2e and package release checks ([ae768f5](https://github.com/tutur3u/platform/commit/ae768f5b46dbfde5943a130cc2b49c15c9676ac2))
* **inventory:** restore operator CRUD and commerce APIs ([dd38d43](https://github.com/tutur3u/platform/commit/dd38d43bea0e812e48ccc989c7204d1212ae4649))

## [1.5.0](https://github.com/tutur3u/platform/compare/database-v1.4.1...database-v1.5.0) (2026-06-11)


### Features

* **finance:** add wallet checkpoints ([54f9f29](https://github.com/tutur3u/platform/commit/54f9f29446ff9991e09a68abb258ce66c640b086))


### Bug Fixes

* **learn:** secure learner quiz practice ([352183b](https://github.com/tutur3u/platform/commit/352183b0c67798867628adddc8fb5d18d262de40))

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

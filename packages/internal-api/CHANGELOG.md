# Changelog

## [0.21.0](https://github.com/tutur3u/platform/compare/internal-api-v0.20.0...internal-api-v0.21.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **inventory:** authorize admin POS fallback ([9ba0fbc](https://github.com/tutur3u/platform/commit/9ba0fbc6765913a83b5ba1a5b1709a608eb7f46c))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **ui:** unify workspace access and sidebar controls ([450183e](https://github.com/tutur3u/platform/commit/450183ef78af8e09a386bebb93be7018379c5152))
* **web:** repair Mira model picker routing ([5ad8a23](https://github.com/tutur3u/platform/commit/5ad8a231c5b9e3e955ec0deee0bc5ef5c9056868))

## [0.20.0](https://github.com/tutur3u/platform/compare/internal-api-v0.19.0...internal-api-v0.20.0) (2026-07-21)


### Features

* **cms:** redesign media library loading ([d382b3b](https://github.com/tutur3u/platform/commit/d382b3bd254086d344b1b066ccbaf913a303a682))
* **infrastructure:** improve internal account management ([fa4e535](https://github.com/tutur3u/platform/commit/fa4e535d3193f275cfac4d808455caaab9d6b326))
* **infrastructure:** manage internal accounts ([02fd9f3](https://github.com/tutur3u/platform/commit/02fd9f3d1b4edb23c881e2dbb04bf244b36e6ed0))
* **inventory:** add analytics and storefront setup ([82503f2](https://github.com/tutur3u/platform/commit/82503f2b8c01a14ed6b2cd492987d5fdd0c6575e))
* **inventory:** improve sales discovery and cart ([cced561](https://github.com/tutur3u/platform/commit/cced5611796e3a0760b65987fbe50afb0876d055))
* **inventory:** streamline sales entry ([ae22db5](https://github.com/tutur3u/platform/commit/ae22db56b982756fe6f76cdb65cfbac913dda807))
* **inventory:** support Square POS app payments ([2cd087e](https://github.com/tutur3u/platform/commit/2cd087e15abe2a43da3c21333fe8d9494564fe37))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))


### Bug Fixes

* **chat:** stop Zalo phone sync spam ([b45e778](https://github.com/tutur3u/platform/commit/b45e778693f175b7bafcd00d6b3ec46f079a946c))
* **inventory:** harden sales analytics and access ([53968d3](https://github.com/tutur3u/platform/commit/53968d38a0c5425a3c1065ab2f645e30a0145c8f))
* **inventory:** honor adjusted sale prices ([1393ac9](https://github.com/tutur3u/platform/commit/1393ac9e44390a54b856ced49fa82229230e2aa8))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))

## [0.19.0](https://github.com/tutur3u/platform/compare/internal-api-v0.18.0...internal-api-v0.19.0) (2026-07-18)


### Features

* **cms:** add relation bundles and managed assets ([fe5ef8a](https://github.com/tutur3u/platform/commit/fe5ef8a4facaacf12e119a6093535097a836303b))
* **cms:** add relation bundles and managed assets ([#4990](https://github.com/tutur3u/platform/issues/4990)) ([3148aa6](https://github.com/tutur3u/platform/commit/3148aa6292c5a706000e70fc9b05dda6b36502bc))
* **inventory:** add bulk sales period controls ([8140a46](https://github.com/tutur3u/platform/commit/8140a4615dfc4f57908086b8cf6ab70ca3a44805))
* **inventory:** add sales periods and mobile commerce ([fa442c9](https://github.com/tutur3u/platform/commit/fa442c9eb06321d91f76b33ee111907d10c85eb7))
* **inventory:** complete Square commerce integration ([fe63eca](https://github.com/tutur3u/platform/commit/fe63eca7d02d94795f93fbbb471069b80c492020))
* **inventory:** revamp payments control center ([0f3d220](https://github.com/tutur3u/platform/commit/0f3d2201ca071315b1a93657d3dda322de773167))
* **inventory:** unify commerce currency and sales periods ([2042bc5](https://github.com/tutur3u/platform/commit/2042bc5a7d4f347d1f610432f379da42f3aa2b8b))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))
* **web:** add member invite link management ([7b46280](https://github.com/tutur3u/platform/commit/7b462802ebaef2de36f2e86ca8325795b933f840))


### Bug Fixes

* **cms:** address managed delivery review findings ([7888033](https://github.com/tutur3u/platform/commit/78880336632d69d11ee462df3a9d69d9732a2e1f))
* **cms:** harden managed import recovery ([f266874](https://github.com/tutur3u/platform/commit/f2668747130606a4479d51df881fb1f2f06d9c9f))
* **contacts:** restore coupon discovery ([cb7dfea](https://github.com/tutur3u/platform/commit/cb7dfea49da9f72e18321f60d7e95c7f056fbea4))
* **contacts:** restore user group and report mutations ([0f3f12d](https://github.com/tutur3u/platform/commit/0f3f12d5291b3a2d3635fc3bde193cbe5f3e8052))
* **inventory:** clarify payment sync and settings ([cf05ed6](https://github.com/tutur3u/platform/commit/cf05ed63cfc47022a95177b661d1fa796d68d65e))
* **inventory:** recover Square exact-price imports ([a377ed8](https://github.com/tutur3u/platform/commit/a377ed89626ae7b77346a984e4e8f7cf3926d4f5))
* **inventory:** restore product and sales CRUD ([c691e74](https://github.com/tutur3u/platform/commit/c691e74c1e67c0523d55a1449647c30873582143))
* **tasks:** repair task media permissions ([28a0bf1](https://github.com/tutur3u/platform/commit/28a0bf1f1ff11359828a335ac81bb20860062942))

## [0.18.0](https://github.com/tutur3u/platform/compare/internal-api-v0.17.0...internal-api-v0.18.0) (2026-07-13)


### Features

* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* improve vocabulary details ([#4958](https://github.com/tutur3u/platform/issues/4958)) ([9e01bd1](https://github.com/tutur3u/platform/commit/9e01bd1e9017a4341487d1e9582e17c27a1a4404))
* **mail:** add smart labels and assisted composing ([8ccd2fa](https://github.com/tutur3u/platform/commit/8ccd2fac0dcf4c67f6eff062dc52e3fc01a2c6ef))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))


### Bug Fixes

* **contacts:** consolidate manager profiles ([69529a3](https://github.com/tutur3u/platform/commit/69529a30cb276ea31d7fa191a823bb9949751058))
* **finance:** keep server API calls on finance origin ([ca6248a](https://github.com/tutur3u/platform/commit/ca6248a224491c3df554310956102cc1fb5bb186))
* **teach:** address vocabulary review feedback ([4efa1a8](https://github.com/tutur3u/platform/commit/4efa1a8037038f5fc3ba018e8ef4e3a128021b54))

## [0.17.0](https://github.com/tutur3u/platform/compare/internal-api-v0.16.0...internal-api-v0.17.0) (2026-07-11)


### Features

* add bulk student performance report sending functionality via new API route and UI components ([4e3e52e](https://github.com/tutur3u/platform/commit/4e3e52e9e894ce581d54fde0aa03f7344e5311fc))
* add difficulty ([24eafbd](https://github.com/tutur3u/platform/commit/24eafbd696e67f6d5e62e1c25eb9d1ae185f9249))
* add quiz deadline functionality to modules and update database schema and types ([8748efe](https://github.com/tutur3u/platform/commit/8748efe164c004395b08af7054208e2929eca631))
* add student report email service and corresponding API route for performance tracking ([22ab655](https://github.com/tutur3u/platform/commit/22ab655ac8b93f0a6dfb5d15142e63ea3fcc66c5))
* **auth:** add email auth recovery override ([0debe1c](https://github.com/tutur3u/platform/commit/0debe1c71efb30bb51081cc3494a732975be0a86))
* **auth:** support workspace session external apps ([0ca4909](https://github.com/tutur3u/platform/commit/0ca4909ce86c3645288696f8e6f7919e05a61a2b))
* **cli:** add task search ([b8ec86f](https://github.com/tutur3u/platform/commit/b8ec86ffd7bf401d32ac29f7c4db0ee60565b717))
* **contacts:** add internal-api contacts base-url seam + web dual-run flag ([fc9f0f8](https://github.com/tutur3u/platform/commit/fc9f0f85b068e5340fe9afb4a0011b2a3d0f2643))
* **contacts:** scaffold contacts.tuturuuu.com satellite shell + monorepo registration ([7e335fc](https://github.com/tutur3u/platform/commit/7e335fc036c4a45ed189095ecd10a43ee002294b))
* **cron:** add managed cron operations ([24012e6](https://github.com/tutur3u/platform/commit/24012e69771a2be480824aad2916a218afee0d20))
* **edu:** add quiz management flow & dashboard improvements ([#4933](https://github.com/tutur3u/platform/issues/4933)) ([9dafc17](https://github.com/tutur3u/platform/commit/9dafc173b1c9e22cfa8731e4383779583f25acbc))
* **edu:** add vocabulary journey ([#4946](https://github.com/tutur3u/platform/issues/4946)) ([06535d2](https://github.com/tutur3u/platform/commit/06535d2766e46206d311e971f6d37ef351fe667b))
* **education:** extract shared education libs into @tuturuuu/education-core and ready learn/teach for API hosting ([dd77db3](https://github.com/tutur3u/platform/commit/dd77db3590786cad51ce76c4d18b30240173ef7e))
* **external-apps:** add managed scheduler cron integration ([431ed1b](https://github.com/tutur3u/platform/commit/431ed1b41682ba41ef190455816e53e06e4d0039))
* **external-apps:** add scoped drive attachments ([a03d577](https://github.com/tutur3u/platform/commit/a03d5775dffa3ed8c4fc5277f06022955a8c7320))
* **finance:** move workspace-finance API routes from apps/web to apps/finance ([bafd61e](https://github.com/tutur3u/platform/commit/bafd61e6394fc2bb9a11efb364ad6c88cd755a4b))
* **finance:** ready apps/finance to host finance API routes ([37c0150](https://github.com/tutur3u/platform/commit/37c0150a5e5821afaefe9aa5a732994673eb9e03))
* **finance:** support prepaid subscription invoice ranges ([fa0f338](https://github.com/tutur3u/platform/commit/fa0f3388dfb3d3ea539a8d8bdc3f100f268542c6))
* implement AI-powered feedback generation for quiz submissions and integrate into the teach interface ([0f5c7cf](https://github.com/tutur3u/platform/commit/0f5c7cf1a1a7a20f7f6e861dc0abb0c30e5c1ea8))
* implement module quiz submission tracking and management interface ([fa4842e](https://github.com/tutur3u/platform/commit/fa4842e669c7fd1ba222b3ebb28947784fd4a806))
* implement quiz score visibility toggle and manual review status for learners ([300909c](https://github.com/tutur3u/platform/commit/300909cdbcd15ad79f6a471a3070985a6b382258))
* implement student performance tracking and update workspace data schemas ([9235679](https://github.com/tutur3u/platform/commit/923567911d080c5bd6720692bc75457b5310b8e5))
* implement teach dashboard statistics API and UI component ([7357463](https://github.com/tutur3u/platform/commit/7357463676dd5a4ff9154bca8193f37494dfe10f))
* **infrastructure:** add abuse protection controls ([0e09692](https://github.com/tutur3u/platform/commit/0e09692a553cb10fbbb521e921951c2a6863281d))
* **infrastructure:** add friendly rate-limit review ([ecb5660](https://github.com/tutur3u/platform/commit/ecb5660d9d749eaf73063dc2acc63a066f222e4d))
* **infrastructure:** add rate-limit appeals ([f1e50e9](https://github.com/tutur3u/platform/commit/f1e50e9fd805dca6c80da8daab60ed24199f24ab))
* **internal-api:** add pay app base-URL seam ([0d1eb1d](https://github.com/tutur3u/platform/commit/0d1eb1d47bde01e8f0e10847fc49ae641019f2bc))
* **inventory:** add product stock history ([b27571e](https://github.com/tutur3u/platform/commit/b27571e575b6ba6a1dba6be0d4a6e0e5037504db))
* **inventory:** add revenue share and category bundles ([20b2e1e](https://github.com/tutur3u/platform/commit/20b2e1e5302d1db275766b7b4b92d9bdf69de04a))
* **inventory:** add Square Terminal checkout ([0a3bd76](https://github.com/tutur3u/platform/commit/0a3bd7635cf9836a379d94851e1a303cec848457))
* **inventory:** store Square credentials per workspace ([e606f23](https://github.com/tutur3u/platform/commit/e606f2341c2684b1ef8a7b72900a056ff7b70469))
* **learn:** move tulearn + guest course API routes from apps/web to apps/learn ([ee1aa7b](https://github.com/tutur3u/platform/commit/ee1aa7b7685403c43aca94f3d97dc64a32374f25))
* **mail:** add advanced mailbox APIs and shadow ingestion ([2543fc5](https://github.com/tutur3u/platform/commit/2543fc5e1fc8ff586692cff07e4eaa42f28d3315))
* **mail:** add catch-all delivery and revamp client ([8d4cb12](https://github.com/tutur3u/platform/commit/8d4cb128275eb42ccd4e2745c7e02983d46f2c66))
* **mail:** add Cloudflare-native mail foundation ([7c755b7](https://github.com/tutur3u/platform/commit/7c755b79274146f2c4987450f99678107242e2f7))
* **pay:** complete payment ownership migration ([e79e421](https://github.com/tutur3u/platform/commit/e79e42107fb3ee34e2cae2703ec33570da6ce950))
* **pay:** scaffold apps/pay satellite (pay.tuturuuu.com, port 7826) ([3d6e45c](https://github.com/tutur3u/platform/commit/3d6e45cca6a315fe67213e438144b73103bae2f5))
* **posts:** add queue diagnostics and observability ([744dcc9](https://github.com/tutur3u/platform/commit/744dcc95a19b0df466098769f42b9c819a439dcd))
* **sdk:** add external project operator commands ([729ab49](https://github.com/tutur3u/platform/commit/729ab4996b6e7e97efdecae72077986b8a6dcbce))
* **tasks:** add quick-create targeting and edge autoscroll ([f03e932](https://github.com/tutur3u/platform/commit/f03e9324b0cce18e9f9974cc8fe251bb58b686bd))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))
* **teach:** move education CRUD, user-group modules, valsea, and AI routes to apps/teach ([6062756](https://github.com/tutur3u/platform/commit/606275693d6647f339042fb140fb8224e9eebdd0))
* **teach:** move teach instructor API routes from apps/web to apps/teach ([fb2cd39](https://github.com/tutur3u/platform/commit/fb2cd392ff68f89dcc2608e5952554f163e7965f))
* **teach:** move the education dashboard to apps/teach and retire the web + tanstack copies ([5c80135](https://github.com/tutur3u/platform/commit/5c801350c5ca7229a0a59b7072e2624384187a16))
* **web:** add managed workspace cron service ([453763e](https://github.com/tutur3u/platform/commit/453763ebce1028e4189f4f1cdf70d8db5a9331c0))
* **web:** migrate settings dialog panels ([e2c0726](https://github.com/tutur3u/platform/commit/e2c0726be944659c749cb618321883277c9e1824))


### Bug Fixes

* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **auth:** show hard IP block support details ([d26684b](https://github.com/tutur3u/platform/commit/d26684b8c7fb2725dacf83a246f08d86ef0e9ef4))
* build checks ([cc5a21e](https://github.com/tutur3u/platform/commit/cc5a21eabf37562d1a716758610e086f03616e67))
* **ci:** recover unresponsive Docker watcher ([28b39e2](https://github.com/tutur3u/platform/commit/28b39e274ea19f173a219c774f213c831fa7dea6))
* **cron:** recover stale docker runner ([33cbe47](https://github.com/tutur3u/platform/commit/33cbe471741f872cb15e8b9895465b601ac5ace1))
* **edu:** stabilize quiz response option mapping ([58e8915](https://github.com/tutur3u/platform/commit/58e8915c284733af28853b5b82a9ad589660655d))
* **infrastructure:** recover cron runner via docker control ([d1f216d](https://github.com/tutur3u/platform/commit/d1f216d3ef7887dec066494d3f1816f607ce28fc))
* **internal-api:** guard cron job search nulls ([cdde19f](https://github.com/tutur3u/platform/commit/cdde19f9cb715d5d3edf36b448e739b24ba024fd))
* **inventory:** harden Square Terminal contracts ([547ce87](https://github.com/tutur3u/platform/commit/547ce87fba395493f1b0c0596e1155a6dad5672d))
* **learn:** pin bootstrap api origin ([e0326fe](https://github.com/tutur3u/platform/commit/e0326fe87faa3457919a416954614508bb8cc6c7))
* **managed-cron:** add admin runner recovery ([13c07c6](https://github.com/tutur3u/platform/commit/13c07c6b3376dc0b4dc446ca6b410b02224ad2f1))
* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))
* **tasks:** serve config APIs from tasks app ([6d12722](https://github.com/tutur3u/platform/commit/6d12722fa54b146d69de0788624327eaa5f3f1a2))
* **tasks:** support personal external terminal defaults ([50434cb](https://github.com/tutur3u/platform/commit/50434cb9849a65dd8c77f6b030b27a4bd76125e4))
* **vocabulary:** stabilize CI and OED lookup ([0d153a7](https://github.com/tutur3u/platform/commit/0d153a74a3cccdc003c90e38fd339e5ec5081ee1))

## [0.16.0](https://github.com/tutur3u/platform/compare/internal-api-v0.15.0...internal-api-v0.16.0) (2026-07-11)


### Features

* add bulk student performance report sending functionality via new API route and UI components ([4e3e52e](https://github.com/tutur3u/platform/commit/4e3e52e9e894ce581d54fde0aa03f7344e5311fc))
* add difficulty ([24eafbd](https://github.com/tutur3u/platform/commit/24eafbd696e67f6d5e62e1c25eb9d1ae185f9249))
* add quiz deadline functionality to modules and update database schema and types ([8748efe](https://github.com/tutur3u/platform/commit/8748efe164c004395b08af7054208e2929eca631))
* add student report email service and corresponding API route for performance tracking ([22ab655](https://github.com/tutur3u/platform/commit/22ab655ac8b93f0a6dfb5d15142e63ea3fcc66c5))
* **contacts:** add internal-api contacts base-url seam + web dual-run flag ([fc9f0f8](https://github.com/tutur3u/platform/commit/fc9f0f85b068e5340fe9afb4a0011b2a3d0f2643))
* **contacts:** scaffold contacts.tuturuuu.com satellite shell + monorepo registration ([7e335fc](https://github.com/tutur3u/platform/commit/7e335fc036c4a45ed189095ecd10a43ee002294b))
* **edu:** add quiz management flow & dashboard improvements ([#4933](https://github.com/tutur3u/platform/issues/4933)) ([9dafc17](https://github.com/tutur3u/platform/commit/9dafc173b1c9e22cfa8731e4383779583f25acbc))
* **edu:** add vocabulary journey ([#4946](https://github.com/tutur3u/platform/issues/4946)) ([06535d2](https://github.com/tutur3u/platform/commit/06535d2766e46206d311e971f6d37ef351fe667b))
* **education:** extract shared education libs into @tuturuuu/education-core and ready learn/teach for API hosting ([dd77db3](https://github.com/tutur3u/platform/commit/dd77db3590786cad51ce76c4d18b30240173ef7e))
* **external-apps:** add scoped drive attachments ([a03d577](https://github.com/tutur3u/platform/commit/a03d5775dffa3ed8c4fc5277f06022955a8c7320))
* **finance:** move workspace-finance API routes from apps/web to apps/finance ([bafd61e](https://github.com/tutur3u/platform/commit/bafd61e6394fc2bb9a11efb364ad6c88cd755a4b))
* **finance:** ready apps/finance to host finance API routes ([37c0150](https://github.com/tutur3u/platform/commit/37c0150a5e5821afaefe9aa5a732994673eb9e03))
* implement AI-powered feedback generation for quiz submissions and integrate into the teach interface ([0f5c7cf](https://github.com/tutur3u/platform/commit/0f5c7cf1a1a7a20f7f6e861dc0abb0c30e5c1ea8))
* implement module quiz submission tracking and management interface ([fa4842e](https://github.com/tutur3u/platform/commit/fa4842e669c7fd1ba222b3ebb28947784fd4a806))
* implement quiz score visibility toggle and manual review status for learners ([300909c](https://github.com/tutur3u/platform/commit/300909cdbcd15ad79f6a471a3070985a6b382258))
* implement student performance tracking and update workspace data schemas ([9235679](https://github.com/tutur3u/platform/commit/923567911d080c5bd6720692bc75457b5310b8e5))
* implement teach dashboard statistics API and UI component ([7357463](https://github.com/tutur3u/platform/commit/7357463676dd5a4ff9154bca8193f37494dfe10f))
* **internal-api:** add pay app base-URL seam ([0d1eb1d](https://github.com/tutur3u/platform/commit/0d1eb1d47bde01e8f0e10847fc49ae641019f2bc))
* **inventory:** add product stock history ([b27571e](https://github.com/tutur3u/platform/commit/b27571e575b6ba6a1dba6be0d4a6e0e5037504db))
* **learn:** move tulearn + guest course API routes from apps/web to apps/learn ([ee1aa7b](https://github.com/tutur3u/platform/commit/ee1aa7b7685403c43aca94f3d97dc64a32374f25))
* **mail:** add advanced mailbox APIs and shadow ingestion ([2543fc5](https://github.com/tutur3u/platform/commit/2543fc5e1fc8ff586692cff07e4eaa42f28d3315))
* **mail:** add catch-all delivery and revamp client ([8d4cb12](https://github.com/tutur3u/platform/commit/8d4cb128275eb42ccd4e2745c7e02983d46f2c66))
* **mail:** add Cloudflare-native mail foundation ([7c755b7](https://github.com/tutur3u/platform/commit/7c755b79274146f2c4987450f99678107242e2f7))
* **pay:** complete payment ownership migration ([e79e421](https://github.com/tutur3u/platform/commit/e79e42107fb3ee34e2cae2703ec33570da6ce950))
* **pay:** scaffold apps/pay satellite (pay.tuturuuu.com, port 7826) ([3d6e45c](https://github.com/tutur3u/platform/commit/3d6e45cca6a315fe67213e438144b73103bae2f5))
* **teach:** move education CRUD, user-group modules, valsea, and AI routes to apps/teach ([6062756](https://github.com/tutur3u/platform/commit/606275693d6647f339042fb140fb8224e9eebdd0))
* **teach:** move teach instructor API routes from apps/web to apps/teach ([fb2cd39](https://github.com/tutur3u/platform/commit/fb2cd392ff68f89dcc2608e5952554f163e7965f))
* **teach:** move the education dashboard to apps/teach and retire the web + tanstack copies ([5c80135](https://github.com/tutur3u/platform/commit/5c801350c5ca7229a0a59b7072e2624384187a16))


### Bug Fixes

* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* build checks ([cc5a21e](https://github.com/tutur3u/platform/commit/cc5a21eabf37562d1a716758610e086f03616e67))
* **edu:** stabilize quiz response option mapping ([58e8915](https://github.com/tutur3u/platform/commit/58e8915c284733af28853b5b82a9ad589660655d))
* **learn:** pin bootstrap api origin ([e0326fe](https://github.com/tutur3u/platform/commit/e0326fe87faa3457919a416954614508bb8cc6c7))
* **tasks:** support personal external terminal defaults ([50434cb](https://github.com/tutur3u/platform/commit/50434cb9849a65dd8c77f6b030b27a4bd76125e4))
* **vocabulary:** stabilize CI and OED lookup ([0d153a7](https://github.com/tutur3u/platform/commit/0d153a74a3cccdc003c90e38fd339e5ec5081ee1))

## [0.15.0](https://github.com/tutur3u/platform/compare/internal-api-v0.14.1...internal-api-v0.15.0) (2026-07-06)


### Features

* **tasks:** add quick-create targeting and edge autoscroll ([f03e932](https://github.com/tutur3u/platform/commit/f03e9324b0cce18e9f9974cc8fe251bb58b686bd))

## [0.14.1](https://github.com/tutur3u/platform/compare/internal-api-v0.14.0...internal-api-v0.14.1) (2026-07-05)


### Bug Fixes

* **tasks:** serve config APIs from tasks app ([6d12722](https://github.com/tutur3u/platform/commit/6d12722fa54b146d69de0788624327eaa5f3f1a2))

## [0.14.0](https://github.com/tutur3u/platform/compare/internal-api-v0.13.0...internal-api-v0.14.0) (2026-07-03)


### Features

* **inventory:** add revenue share and category bundles ([20b2e1e](https://github.com/tutur3u/platform/commit/20b2e1e5302d1db275766b7b4b92d9bdf69de04a))
* **sdk:** add external project operator commands ([729ab49](https://github.com/tutur3u/platform/commit/729ab4996b6e7e97efdecae72077986b8a6dcbce))

## [0.13.0](https://github.com/tutur3u/platform/compare/internal-api-v0.12.0...internal-api-v0.13.0) (2026-07-02)


### Features

* **cron:** add managed cron operations ([24012e6](https://github.com/tutur3u/platform/commit/24012e69771a2be480824aad2916a218afee0d20))
* **infrastructure:** add abuse protection controls ([0e09692](https://github.com/tutur3u/platform/commit/0e09692a553cb10fbbb521e921951c2a6863281d))


### Bug Fixes

* **auth:** show hard IP block support details ([d26684b](https://github.com/tutur3u/platform/commit/d26684b8c7fb2725dacf83a246f08d86ef0e9ef4))
* **cron:** recover stale docker runner ([33cbe47](https://github.com/tutur3u/platform/commit/33cbe471741f872cb15e8b9895465b601ac5ace1))

## [0.12.0](https://github.com/tutur3u/platform/compare/internal-api-v0.11.0...internal-api-v0.12.0) (2026-06-29)


### Features

* **auth:** add email auth recovery override ([0debe1c](https://github.com/tutur3u/platform/commit/0debe1c71efb30bb51081cc3494a732975be0a86))
* **cli:** add task search ([b8ec86f](https://github.com/tutur3u/platform/commit/b8ec86ffd7bf401d32ac29f7c4db0ee60565b717))
* **external-apps:** add managed scheduler cron integration ([431ed1b](https://github.com/tutur3u/platform/commit/431ed1b41682ba41ef190455816e53e06e4d0039))
* **finance:** support prepaid subscription invoice ranges ([fa0f338](https://github.com/tutur3u/platform/commit/fa0f3388dfb3d3ea539a8d8bdc3f100f268542c6))
* **infrastructure:** add friendly rate-limit review ([ecb5660](https://github.com/tutur3u/platform/commit/ecb5660d9d749eaf73063dc2acc63a066f222e4d))
* **infrastructure:** add rate-limit appeals ([f1e50e9](https://github.com/tutur3u/platform/commit/f1e50e9fd805dca6c80da8daab60ed24199f24ab))
* **inventory:** add Square Terminal checkout ([0a3bd76](https://github.com/tutur3u/platform/commit/0a3bd7635cf9836a379d94851e1a303cec848457))
* **inventory:** store Square credentials per workspace ([e606f23](https://github.com/tutur3u/platform/commit/e606f2341c2684b1ef8a7b72900a056ff7b70469))
* **posts:** add queue diagnostics and observability ([744dcc9](https://github.com/tutur3u/platform/commit/744dcc95a19b0df466098769f42b9c819a439dcd))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))


### Bug Fixes

* **infrastructure:** recover cron runner via docker control ([d1f216d](https://github.com/tutur3u/platform/commit/d1f216d3ef7887dec066494d3f1816f607ce28fc))
* **internal-api:** guard cron job search nulls ([cdde19f](https://github.com/tutur3u/platform/commit/cdde19f9cb715d5d3edf36b448e739b24ba024fd))
* **inventory:** harden Square Terminal contracts ([547ce87](https://github.com/tutur3u/platform/commit/547ce87fba395493f1b0c0596e1155a6dad5672d))
* **managed-cron:** add admin runner recovery ([13c07c6](https://github.com/tutur3u/platform/commit/13c07c6b3376dc0b4dc446ca6b410b02224ad2f1))
* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))

## [0.11.0](https://github.com/tutur3u/platform/compare/internal-api-v0.10.0...internal-api-v0.11.0) (2026-06-26)


### Features

* **auth:** support workspace session external apps ([0ca4909](https://github.com/tutur3u/platform/commit/0ca4909ce86c3645288696f8e6f7919e05a61a2b))
* **internal-api:** add api key migration bridge ([4e7c84a](https://github.com/tutur3u/platform/commit/4e7c84ab1a2ef2a22d454a79e2f8cacb9e399bb2))
* **internal-api:** add workspace billing backend facades ([16a3ac7](https://github.com/tutur3u/platform/commit/16a3ac72241186f092f5246b66810afa367bec94))
* **tanstack:** migrate account deletion route ([bf9f17f](https://github.com/tutur3u/platform/commit/bf9f17f5f1a38768bab8409e8f7943915ef8a2f7))
* **tanstack:** migrate cron jobs page ([088d0f9](https://github.com/tutur3u/platform/commit/088d0f9ae87b9b8248383a3ba6e902a7ccceeeaa))
* **tanstack:** migrate document detail preview ([a26aa54](https://github.com/tutur3u/platform/commit/a26aa54df9d69f627a8b5710d52f57a6303653b4))
* **tanstack:** migrate documents list route ([3f7ea4c](https://github.com/tutur3u/platform/commit/3f7ea4c1f5d4106d0080dfadd55d3ea75c806391))
* **tanstack:** migrate group tag detail ([a66aa7c](https://github.com/tutur3u/platform/commit/a66aa7cf0c8b5d52905a1f4c4abe660b1f826452))
* **tanstack:** migrate notifications inbox ([7868432](https://github.com/tutur3u/platform/commit/78684322eac9c405d7c37c674513c7275ad8be98))
* **tanstack:** migrate realtime analytics page ([d3cb3f0](https://github.com/tutur3u/platform/commit/d3cb3f051e591646d9b3665290f133fdef6699f9))
* **tanstack:** migrate user group attendance ([085e752](https://github.com/tutur3u/platform/commit/085e752c04508975b34ddb95904c7593608b53a3))
* **tasks:** add task progress tracking ([4cffb0f](https://github.com/tutur3u/platform/commit/4cffb0f041d41e3868481068d64b9e3b85a0011a))
* **web:** add managed workspace cron service ([453763e](https://github.com/tutur3u/platform/commit/453763ebce1028e4189f4f1cdf70d8db5a9331c0))
* **web:** migrate settings dialog panels ([e2c0726](https://github.com/tutur3u/platform/commit/e2c0726be944659c749cb618321883277c9e1824))


### Bug Fixes

* **ci:** recover unresponsive Docker watcher ([28b39e2](https://github.com/tutur3u/platform/commit/28b39e274ea19f173a219c774f213c831fa7dea6))
* **tasks:** improve shared board collaboration ([fa4ca4d](https://github.com/tutur3u/platform/commit/fa4ca4d412c8f8f533ab87639b314fefc70f9107))
* **tasks:** show accessible guest task boards ([3153c48](https://github.com/tutur3u/platform/commit/3153c4814e599905ea3de36b3f63e941d6bc86d9))
* **tasks:** support assignees on shared personal boards ([112a561](https://github.com/tutur3u/platform/commit/112a561f38cd73bf4c928117cb4d2f0b178dc7e4))

## [0.10.0](https://github.com/tutur3u/platform/compare/internal-api-v0.9.0...internal-api-v0.10.0) (2026-06-24)


### Features

* add submissions tab and data fetching to test detail view ([0f3dfa2](https://github.com/tutur3u/platform/commit/0f3dfa2561e168464d97dc012c65a56177f00e29))
* add tanstack rust migration foundation ([da7e58a](https://github.com/tutur3u/platform/commit/da7e58a2a6c7eefff5df74859e991872b5195132))
* add test apge ([2d62fc8](https://github.com/tutur3u/platform/commit/2d62fc883379ad54e800e8555e40168de5327295))
* add test for user ([e14c981](https://github.com/tutur3u/platform/commit/e14c98116c1ea07f4bf1af578e08e280cefc9bb5))
* **backend:** expose contact data readiness ([7d06ad0](https://github.com/tutur3u/platform/commit/7d06ad0167af31e535e97d65b6a6dc99c8b89cab))
* **calendar:** add configurable two-way sync ([76078d8](https://github.com/tutur3u/platform/commit/76078d865618b4970b430b08f0db7a1a8c30ffcb))
* implement teach test submission review and student question feedback ([11cb373](https://github.com/tutur3u/platform/commit/11cb3736d3c35c18f0ed341f807f5df5a5775c31))
* implement test score visibility control and add submission review functionality ([2ce0416](https://github.com/tutur3u/platform/commit/2ce0416d6f192f539a859e5b66d7b8333dbe7b63))
* **internal-api:** add backend auth facades ([2f0c641](https://github.com/tutur3u/platform/commit/2f0c641c3b93be56562f558fe30bf00556aecb6d))
* **internal-api:** add backend domain facades ([58fab77](https://github.com/tutur3u/platform/commit/58fab778a03d16031f3588ea4b5f1a7bfd1d3dee))
* **internal-api:** add backend user auth facades ([cf054b4](https://github.com/tutur3u/platform/commit/cf054b45b16fe8e36b282f6a4794c4795c67fff8))
* **internal-api:** add backend workspace facades ([e9cdc50](https://github.com/tutur3u/platform/commit/e9cdc50f7a28ab4590e355a6a8b483a21cbb8b1c))
* **internal-api:** add current-workspace-user reader (unblocks user-scoped routes) ([3fcb291](https://github.com/tutur3u/platform/commit/3fcb291236077d42f4d5d662016b84d7e38a8489))
* **inventory:** surface storefront checkout sales ([c8e813c](https://github.com/tutur3u/platform/commit/c8e813caa23e7e77e94aa94c9f0059b95cd5ba1c))
* migrate auth preflight methods to rust ([c598ec1](https://github.com/tutur3u/platform/commit/c598ec1d9927851d39c45ac020b06c123856c432))
* **tanstack:** migrate ai-chat/my-chatbots + group-tags facades ([8044a34](https://github.com/tutur3u/platform/commit/8044a34be438eab099b050532857f1be254c6b69))
* **tanstack:** migrate blocked ips page ([a798679](https://github.com/tutur3u/platform/commit/a798679070014503b2e9ecc42a8cb7fb8726c473))
* **tanstack:** migrate community profile ([bdd7947](https://github.com/tutur3u/platform/commit/bdd7947e61532212e5acabb8edbd73a83a709338))
* **tanstack:** migrate course-module quiz-sets + module quiz-sets endpoint ([ff902b8](https://github.com/tutur3u/platform/commit/ff902b818fc6da852e4a18f51d3eadcbce11123c))
* **tanstack:** migrate crawler read-only pages ([0d3418e](https://github.com/tutur3u/platform/commit/0d3418ed9a018f70b6063cd68285f8422dbb51c6))
* **tanstack:** migrate cron monitoring page ([3d495f8](https://github.com/tutur3u/platform/commit/3d495f83f75b21173ce779851afbed78fb730fb6))
* **tanstack:** migrate education attempts ([669a209](https://github.com/tutur3u/platform/commit/669a209289eacb11a85e59524b4d57fae50fc109))
* **tanstack:** migrate education quiz-set detail + set quizzes endpoint ([31cbcfc](https://github.com/tutur3u/platform/commit/31cbcfcc6788c5fc2bb71ff9a8a99a268be7f26b))
* **tanstack:** migrate education/library/flashcards + flashcards list facade ([8e29afe](https://github.com/tutur3u/platform/commit/8e29afed71a906693ed98ac42bc11b25c987943a))
* **tanstack:** migrate education/library/quiz-sets + quiz-sets list facade ([e62e0db](https://github.com/tutur3u/platform/commit/e62e0dbd364d4c08eb4fba2ffd770fb5a2123b50))
* **tanstack:** migrate education/library/quizzes + quiz-explanation facade ([fe99e70](https://github.com/tutur3u/platform/commit/fe99e706d342fb4a8271eef3a2f75f8a874975e9))
* **tanstack:** migrate email blacklist page ([2e6ac69](https://github.com/tutur3u/platform/commit/2e6ac69069a30150b612caf4363d186b709340af))
* **tanstack:** migrate github bot settings page ([7c2ab6d](https://github.com/tutur3u/platform/commit/7c2ab6dad5fb85334c07f8e1f6eaa1ae6da201ab))
* **tanstack:** migrate holidays page ([e48a59b](https://github.com/tutur3u/platform/commit/e48a59b0fd791729fce4846af82a303cb2dbcde3))
* **tanstack:** migrate infrastructure abuse events ([48f85f5](https://github.com/tutur3u/platform/commit/48f85f512c930d7a1f0572163c564c251f3420af))
* **tanstack:** migrate infrastructure changelog ([be9da3c](https://github.com/tutur3u/platform/commit/be9da3ca05bc882a54478addf45998a40809cadf))
* **tanstack:** migrate inventory/promotions via new deleteWorkspacePromotion facade ([bd88050](https://github.com/tutur3u/platform/commit/bd88050e59de31b0daa5d279fb181eda72131a82))
* **tanstack:** migrate logout route ([dc747de](https://github.com/tutur3u/platform/commit/dc747de8f2da01611575b59f074b771473571b4f))
* **tanstack:** migrate mobile deployment page ([2ace244](https://github.com/tutur3u/platform/commit/2ace244f121d53c7356634d5f217083f375a7253))
* **tanstack:** migrate mobile versions page ([ecf7ed6](https://github.com/tutur3u/platform/commit/ecf7ed66bac3c63266fe5f2869cc5d1bd8bcee79))
* **tanstack:** migrate models and changelog routes ([256bc12](https://github.com/tutur3u/platform/commit/256bc129f2219b9e6ca3c267f9a275851f2e3610))
* **tanstack:** migrate notification settings ([e1d218b](https://github.com/tutur3u/platform/commit/e1d218b3489f260e3056548cdff5629153f39522))
* **tanstack:** migrate post email queue page ([cd23dc3](https://github.com/tutur3u/platform/commit/cd23dc32fb192bdb70eb1d4d0c62b8340ddbdc76))
* **tanstack:** migrate public task board ([f101275](https://github.com/tutur3u/platform/commit/f101275f9cb708d441a15382c5005927f2ea1969))
* **tanstack:** migrate quiz-set library ([7cdb461](https://github.com/tutur3u/platform/commit/7cdb46120043be635f0e85738772fe7334249e38))
* **tanstack:** migrate quiz-set linked-modules + course-modules endpoints ([5a4e3ce](https://github.com/tutur3u/platform/commit/5a4e3cef8a11b9a106a63d24d658748c109908de))
* **tanstack:** migrate reports settings ([e83f109](https://github.com/tutur3u/platform/commit/e83f109c14802b9fe18ac2f52107c0d184d9ea03))
* **tanstack:** migrate rollout monitoring page ([6f80141](https://github.com/tutur3u/platform/commit/6f8014177817b55956ab495c9c6cf33f86dc5c5d))
* **tanstack:** migrate stress tests page ([d0a6d37](https://github.com/tutur3u/platform/commit/d0a6d370a862f182a6f85e560794d017a8c08ba5))
* **tanstack:** migrate timezones page ([34bd5e8](https://github.com/tutur3u/platform/commit/34bd5e84db4b277152f04569dd5da61993453100))
* **tanstack:** migrate users/approvals via new approval facades ([62b038d](https://github.com/tutur3u/platform/commit/62b038de371228d23841795cfa1089dfd8877fbe))
* **tanstack:** migrate users/feedbacks via getWorkspaceUser facade ([283ad92](https://github.com/tutur3u/platform/commit/283ad92aa6ecbceb0bf5ea321d6798bae8fed9fb))
* **tanstack:** migrate users/group-tags route + group-tag write facades ([3c01ea9](https://github.com/tutur3u/platform/commit/3c01ea9ddfb0363a559988aeeae9c6d97f0733ac))
* **tanstack:** migrate users/groups/[groupId]/schedule + group-update facade ([e7bd6bc](https://github.com/tutur3u/platform/commit/e7bd6bc9dcbd50b0cdef19d606eab5461e5f0c56))
* **tanstack:** migrate watcher logs page ([0e89559](https://github.com/tutur3u/platform/commit/0e895593e20fe5993a924a7559ce25e430931e47))
* **tanstack:** prefer backend service binding ([1b5b37c](https://github.com/tutur3u/platform/commit/1b5b37c36e1f5522f06f410eebf8510d78e28ffc))
* **tanstack:** route contact through rust server functions ([6871b0c](https://github.com/tutur3u/platform/commit/6871b0c096b8f937d544d28aa77b221aabb1aeca))
* **task-boards:** improve public board sharing UX ([930ceb4](https://github.com/tutur3u/platform/commit/930ceb49ef72fad22e3f412c2ff5648fd6b3c417))
* **tasks:** add board-centered tasks entry ([cfb0dd6](https://github.com/tutur3u/platform/commit/cfb0dd689924f91f2b9b848e82c0feab89f62ab0))
* **tasks:** add public board sharing ([b5a4a07](https://github.com/tutur3u/platform/commit/b5a4a0796dab947e8dca3970d6aa136a4863dd35))
* **tasks:** add shareable kanban task plans ([2de4e58](https://github.com/tutur3u/platform/commit/2de4e5819673e11b01cdc1f21c317f33dc196f56))
* **tasks:** consolidate board task settings ([b1d720a](https://github.com/tutur3u/platform/commit/b1d720ac865406d6dd0b2477c5ba04e336de9929))


### Bug Fixes

* **calendar:** stabilize optimistic event sync ([fda22e1](https://github.com/tutur3u/platform/commit/fda22e1eebec28e04af0b8a2ab22d0f148c0565d))
* **ci:** satisfy CodeFactor and lockfile checks ([bc29c3d](https://github.com/tutur3u/platform/commit/bc29c3d15e0951545818005335f673282fafdc80))
* harden backend origin resolution ([9592afb](https://github.com/tutur3u/platform/commit/9592afbbf52b4c84d28125f735822a8e15f375a8))
* **tasks:** polish board toolbar settings and activity ([e1966bb](https://github.com/tutur3u/platform/commit/e1966bb68d4900e4d5d187153f3a8942727f2127))
* **tasks:** polish board views and loading ([0b60957](https://github.com/tutur3u/platform/commit/0b6095726b6c1aaae4f794ba6cfecde4d46f0db9))
* **tasks:** polish task board loading and defaults ([7c215d3](https://github.com/tutur3u/platform/commit/7c215d3ea6b0b710247069f8616d4b7b1029147f))
* **teach:** address test review follow-ups ([bfc6c12](https://github.com/tutur3u/platform/commit/bfc6c12eade212bf8775b78cc2853fd8b14601e7))
* **web:** repair rate-limit diagnostics and blocked IP filters ([5494878](https://github.com/tutur3u/platform/commit/54948780e848f51255bd8b7bfb08a2834818720c))

## [0.9.0](https://github.com/tutur3u/platform/compare/internal-api-v0.8.0...internal-api-v0.9.0) (2026-06-17)


### Features

* add tests ([1bd19e0](https://github.com/tutur3u/platform/commit/1bd19e0402a78084095dd523603aca6ee52418fc))
* create test ([c225f9d](https://github.com/tutur3u/platform/commit/c225f9d636a701397c43249131f35fbb36e284e4))
* create test page ([618fffa](https://github.com/tutur3u/platform/commit/618fffabeeedfa09d72cd877e2bfd9e806a05090))
* create test view for student ([40bdd08](https://github.com/tutur3u/platform/commit/40bdd08ca449c7e151b0beae6d27d60fb913fe51))
* **inventory:** fix Polar checkout currency, add 2-way product sync, cache + redesign storefront ([de2f6fd](https://github.com/tutur3u/platform/commit/de2f6fd6e06ce5242a150a35d3989798f52b9ee9))
* **inventory:** per-storefront Polar environment + clearer checkout errors ([b30c2ed](https://github.com/tutur3u/platform/commit/b30c2eddced0d63ce47c857e8da4578fcf6151d1))
* **inventory:** per-variant SKUs + storefront cart, dialog & instant checkout ([9662b85](https://github.com/tutur3u/platform/commit/9662b8501bcab51033edde79b44991c8ba648a37))
* **inventory:** per-workspace Polar webhook ingestion + signature verification ([862b25a](https://github.com/tutur3u/platform/commit/862b25af444a56ef85c6a4e3dab7b91ae71438fe))
* **inventory:** Polar product sync-health card in the hub ([5552285](https://github.com/tutur3u/platform/commit/5552285621ce5353ef3bf83344a3d0b0648b403b))
* **inventory:** storefront analytics funnel ([312fc6d](https://github.com/tutur3u/platform/commit/312fc6d9dafe4300ddcbddbc953b35dba6f418f6))
* **mobile-deployment:** add field dropdowns and non-secret value readback ([a3a27d1](https://github.com/tutur3u/platform/commit/a3a27d1d9e4e2b25fcfd8a930cdc63c6e47d3224))
* **tasks:** add per-board default list for new tasks ([2d1d308](https://github.com/tutur3u/platform/commit/2d1d3082422bdd4813accb258fee79b322ce647b))
* **users:** add no-auth mode for profile-completion links ([c97daee](https://github.com/tutur3u/platform/commit/c97daee7ee04a6d2585213c510dc3943943257d8))
* **web:** extend profile completion links ([e8585a3](https://github.com/tutur3u/platform/commit/e8585a390b4cc8ae44cd0a15e667ae0f94a52494))
* **web:** rate limits admin center ([fe61dc9](https://github.com/tutur3u/platform/commit/fe61dc933615466f6169a3db3a4a1840f705e80b))


### Bug Fixes

* **auth:** consume external app refresh tokens ([7f5a4ab](https://github.com/tutur3u/platform/commit/7f5a4ab250214018ca34e61b7084fd55865c17bc))
* build checks ([3b9c3e9](https://github.com/tutur3u/platform/commit/3b9c3e9904bf2122b247a38c313e8622637910b7))
* **ci:** stabilize platform check gates ([81c7cc9](https://github.com/tutur3u/platform/commit/81c7cc9b97ec12c7406ba63a330ecd7f062714fc))
* **external:** verify media asset upload sizes ([388d65c](https://github.com/tutur3u/platform/commit/388d65c039042deac06371093a1e21c300ac05f6))
* **inventory:** match promotion update response ([a1a3450](https://github.com/tutur3u/platform/commit/a1a34503d5868e06d85d2d4bd9dd0cca94d0d47b))
* **inventory:** use resolved workspace id in Polar webhook URL ([6395708](https://github.com/tutur3u/platform/commit/639570850fb21d90647c73fc2aff1fe127e2f5a1))
* **members:** omit profile emails from updates ([4cdce52](https://github.com/tutur3u/platform/commit/4cdce52848ecc772b4f2cc1c54f6db673475ea81))
* ording question ([f0c32a4](https://github.com/tutur3u/platform/commit/f0c32a4e3b7634c73b0b7cc9b9b05af83468549a))
* **reports:** surface dashboard error codes ([db894c2](https://github.com/tutur3u/platform/commit/db894c2e978725c15ac38f2169bfd6511b37057d))
* **tasks:** hydrate task workspace metadata from server ([ebbcecb](https://github.com/tutur3u/platform/commit/ebbcecbd88e3215c6f91d7fc0719ce5bb6f23eee))
* **tulearn:** restore quiz answer feedback ([f462b57](https://github.com/tutur3u/platform/commit/f462b576d2b41889135c89a183c6bad09d410e92))
* **tulearn:** secure learner quiz submissions ([94afe79](https://github.com/tutur3u/platform/commit/94afe79e8b5c36bba8bd6d5c423faaf487d412d9))
* UI inconsistence and quiz sumission ([e9e360e](https://github.com/tutur3u/platform/commit/e9e360ef76c3f0513cf54a34a718e895c222de36))

## [0.8.0](https://github.com/tutur3u/platform/compare/internal-api-v0.7.1...internal-api-v0.8.0) (2026-06-15)


### Features

* **infrastructure:** edit mobile deployment env keys ([d3ad001](https://github.com/tutur3u/platform/commit/d3ad001bc503d21b3e495b47de6b277e8dc93c4f))
* **infrastructure:** protect mobile deployment vault ([bea31f2](https://github.com/tutur3u/platform/commit/bea31f2f71de509c5bc5e1b154ba62928ecea9c6))
* **internal-api:** add inventory promotion create/update/delete helpers ([27ea765](https://github.com/tutur3u/platform/commit/27ea76577712fcc958185a6fd2652a6fae918e52))
* **inventory:** add per-product actual P&L to the sales tab ([4dcdb29](https://github.com/tutur3u/platform/commit/4dcdb297e5dcce3adacdd2531e698068eecf4e6b))
* **inventory:** improve dialog lifecycle audit ux ([6d7814c](https://github.com/tutur3u/platform/commit/6d7814c80415bb14680746613e96d03387708df1))
* **inventory:** upgrade storefront commerce ([ac43942](https://github.com/tutur3u/platform/commit/ac439426ec6d7abc25efbf7ef88468e32be3a46e))
* **web:** add external user profile-completion links ([0effeb8](https://github.com/tutur3u/platform/commit/0effeb860f999227f673a55212d2cfd0c822105a))


### Bug Fixes

* **inventory:** route catalog product creation ([5887ef5](https://github.com/tutur3u/platform/commit/5887ef5bdf361b0c664063cbccb85cd51b437d4b))
* **tasks:** persist large task descriptions in chunks ([457744a](https://github.com/tutur3u/platform/commit/457744aa051d06baccc5df5aa4d4cb509534ea8b))
* **web:** handle processing topic announcements ([7462fb4](https://github.com/tutur3u/platform/commit/7462fb4a0d86ae26e54564c18281bc97407b31c4))

## [0.7.1](https://github.com/tutur3u/platform/compare/internal-api-v0.7.0...internal-api-v0.7.1) (2026-06-13)


### Bug Fixes

* **inventory:** route setup references through inventory APIs ([ae465ee](https://github.com/tutur3u/platform/commit/ae465ee90b202de02176c52037fa3f20b017a758))

## [0.7.0](https://github.com/tutur3u/platform/compare/internal-api-v0.6.0...internal-api-v0.7.0) (2026-06-13)


### Features

* **inventory:** add command center dashboard ([37ea5c5](https://github.com/tutur3u/platform/commit/37ea5c5e32c8be149a077269f246f4a369739f84))

## [0.6.0](https://github.com/tutur3u/platform/compare/internal-api-v0.5.0...internal-api-v0.6.0) (2026-06-13)


### Features

* **ci:** add GitHub bot check auto-pickup ([9e62daa](https://github.com/tutur3u/platform/commit/9e62daa5267b29ca5e55ed85c7d560415cef3b77))
* **finance:** add infinite wallet loading ([76eba7a](https://github.com/tutur3u/platform/commit/76eba7a849c3a6b948e231a1e83e1e2faa10bb16))
* **finance:** add reconciliation defaults and audited balances ([206f941](https://github.com/tutur3u/platform/commit/206f9416351ade0cfbd1ed822595d44843efbaeb))
* **finance:** add wallet checkpoint audit history ([11139c7](https://github.com/tutur3u/platform/commit/11139c7e354a8f29e83187748711f6ae39c48e70))
* **inventory:** add costing and simulated storefront checkout ([7fcdabb](https://github.com/tutur3u/platform/commit/7fcdabb145e6fa9cc899b563b117e65f7772643a))
* **inventory:** improve operator form workflows ([aa853a6](https://github.com/tutur3u/platform/commit/aa853a69c5d0166a55d2111ac962d0676bf91a56))
* **inventory:** revamp storefront commerce experience ([72a2bde](https://github.com/tutur3u/platform/commit/72a2bde46a1e6c2815d0b2111fc743373c7bec9b))
* **tasks:** add compact task dialog AI suggestions ([99058e9](https://github.com/tutur3u/platform/commit/99058e90a4f81153f664eb92fdbacade1e2188c6))


### Bug Fixes

* **infrastructure:** retire watcher production promotion ([df87579](https://github.com/tutur3u/platform/commit/df8757987459fd40661e988774ba0a46642376b4))
* **inventory:** consolidate commerce setup flows ([447cc3d](https://github.com/tutur3u/platform/commit/447cc3dbd64c864bda2d6cf88c2245cf16a1eac2))
* **inventory:** restore operator CRUD and commerce APIs ([dd38d43](https://github.com/tutur3u/platform/commit/dd38d43bea0e812e48ccc989c7204d1212ae4649))
* **tasks:** hydrate external dialogs from source workspace ([95a7a23](https://github.com/tutur3u/platform/commit/95a7a23ec8957918cffc81698e8fdc8951adf400))

## [0.5.0](https://github.com/tutur3u/platform/compare/internal-api-v0.4.1...internal-api-v0.5.0) (2026-06-11)


### Features

* **cli:** add calendar commands ([b916c1a](https://github.com/tutur3u/platform/commit/b916c1a0eeecfae961292466de0e9b37b9512b69))
* **finance:** add wallet checkpoints ([54f9f29](https://github.com/tutur3u/platform/commit/54f9f29446ff9991e09a68abb258ce66c640b086))
* **infrastructure:** improve log observability and redis defaults ([566724d](https://github.com/tutur3u/platform/commit/566724d691c0703038373d811ac41c709efa9544))


### Bug Fixes

* **learn:** secure learner quiz practice ([352183b](https://github.com/tutur3u/platform/commit/352183b0c67798867628adddc8fb5d18d262de40))
* **learn:** type learner quiz data ([f98ec7c](https://github.com/tutur3u/platform/commit/f98ec7cf0cf2f2e93faa8b57577dfff58a555a63))

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

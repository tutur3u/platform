:robot: I have created a release *beep* *boop*
---


<details><summary>platform: 0.26.0</summary>

## [0.26.0](https://github.com/tutur3u/platform/compare/platform-v0.25.0...platform-v0.26.0) (2026-07-24)


### Features

* **apps:** unify and redesign app catalog ([b679068](https://github.com/tutur3u/platform/commit/b679068339143a83b38610f363bec7f53ddc3706))
* **cms:** support Richfield external project forms ([befa92f](https://github.com/tutur3u/platform/commit/befa92f30f4e4f7f2a56a043bf79a99c153845e6))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** add POS device management ([822a171](https://github.com/tutur3u/platform/commit/822a171ae280511d6453fd5547f584f9c796d077))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** drop the hero badge and rebuild the product frame ([b3259df](https://github.com/tutur3u/platform/commit/b3259df881968f03dbb4c5b28c5a30a6a236fd52))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **marketing:** rebuild security, partners, careers, blog and contributors ([98515d7](https://github.com/tutur3u/platform/commit/98515d775a6ad530a00125d1981635fa9428547b))
* **marketing:** rebuild the legal kit, security subpages and docs chrome ([9a4cfaa](https://github.com/tutur3u/platform/commit/9a4cfaae9d199871f33256cfabc206fe61c4c412))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))
* **web:** improve workspace navigation context ([73959e3](https://github.com/tutur3u/platform/commit/73959e3c6745f60513d23740f30024c5d24e7ee4))
* **web:** rebuild about and contact pages ([4775ac2](https://github.com/tutur3u/platform/commit/4775ac2d0da26e23ecc463ae01a82c83da4ebf03))
* **web:** rebuild changelog and branding on the marketing system ([813a6e9](https://github.com/tutur3u/platform/commit/813a6e9ce926fcaff96c5a638d0a129e17199d72))
* **web:** rebuild marketing navbar ([f0cd6f6](https://github.com/tutur3u/platform/commit/f0cd6f66a29827c4eccc6cf37e50833b3f6ccd13))
* **web:** rebuild product marketing pages ([fb96cd1](https://github.com/tutur3u/platform/commit/fb96cd10e62f157c82e63fc1f6646699a88daa21))
* **web:** redesign marketing landing page ([13ede78](https://github.com/tutur3u/platform/commit/13ede784ac03af9f25bbb7df61095826c335e002))
* **web:** refine marketing experience ([c7f1cec](https://github.com/tutur3u/platform/commit/c7f1cec0dd667e6d5f59aaf0bab82069b79c7376))
* **web:** serve the GitHub release feed on /changelog ([cca2927](https://github.com/tutur3u/platform/commit/cca292703fffb04504009cb7a230aa01c74219bb))


### Bug Fixes

* **ai:** repair Mira reasoning streams ([c04386a](https://github.com/tutur3u/platform/commit/c04386a9742c85d0af149d27850d7e6c591a54bc))
* **backend:** remove obsolete authenticated request helper ([81844db](https://github.com/tutur3u/platform/commit/81844db3d33130945119d9acc5080b652b73b3c1))
* **ci:** align marketing migration checks ([7a94038](https://github.com/tutur3u/platform/commit/7a940387ca1a3cfa11b35e0109156c1816610558))
* **ci:** align tanstack public route assertions ([3cf9547](https://github.com/tutur3u/platform/commit/3cf9547dd5e711a284c6e7bd84e3ed9bc4f14cd9))
* **ci:** isolate production database secrets ([d6859ae](https://github.com/tutur3u/platform/commit/d6859aef2e48f424b424a514d2ae03fbf896b110))
* **ci:** restore dependency refresh validation ([fc47eca](https://github.com/tutur3u/platform/commit/fc47ecad9df84099b187cc5427da663a64ab2875))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **ci:** stabilize tasks lifecycle flow ([f7a6356](https://github.com/tutur3u/platform/commit/f7a6356834c5a2a4fb240d5e51f5021f4d67af19))
* **cms:** allow bound project member setup ([c3d420d](https://github.com/tutur3u/platform/commit/c3d420d894805efd181ab0cdfa551befaf5a5426))
* **cms:** allow root admin member bootstrap ([87f138e](https://github.com/tutur3u/platform/commit/87f138e0a82cb10d4493a39373c3042d0345bfe4))
* **e2e:** follow satellite route ownership ([591190c](https://github.com/tutur3u/platform/commit/591190cd24aa15ba6cde1eb17a98409a461e0201))
* **infrastructure:** authorize external app registry sessions ([a09e8f7](https://github.com/tutur3u/platform/commit/a09e8f7a3290bdd814c0dddbbd9b6771db5f6ef0))
* **infrastructure:** freeze Vercel dependency installs ([96cd10c](https://github.com/tutur3u/platform/commit/96cd10cd0f59d32a4ed1570944d469cfb3418393))
* **infrastructure:** guard whitelist request rendering ([a84acac](https://github.com/tutur3u/platform/commit/a84acacbb1de012293f76ab2cf60fd014e89478c))
* **infrastructure:** own admin APIs and paginate models ([a73514c](https://github.com/tutur3u/platform/commit/a73514cbdac132a9bd05f69979cd48561a223ee0))
* **infrastructure:** own AI credit admin APIs ([4606857](https://github.com/tutur3u/platform/commit/46068572bb741155973a7602e21026b8e8beb02b))
* **infrastructure:** pin Vercel Bun installer ([2dcaef0](https://github.com/tutur3u/platform/commit/2dcaef0dd6d87a89ebef87b34368ba926d949b50))
* **infrastructure:** restore production builds ([a9adc4a](https://github.com/tutur3u/platform/commit/a9adc4adc728114d7153511e77dbfddd58714700))
* **infrastructure:** use satellite database runtime ([ee4044e](https://github.com/tutur3u/platform/commit/ee4044edada1b69615e2cb62765e81c51c315d2e))
* **inventory:** authorize admin POS fallback ([9ba0fbc](https://github.com/tutur3u/platform/commit/9ba0fbc6765913a83b5ba1a5b1709a608eb7f46c))
* **inventory:** distinguish Square POS device paths ([4654605](https://github.com/tutur3u/platform/commit/4654605a366a00134b0a9a27a1dd2124f579c35c))
* **inventory:** make storefront removal safe ([9dd4dc6](https://github.com/tutur3u/platform/commit/9dd4dc67ff264860e8b83785db2e2e87ec91959d))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **inventory:** repair storefront removal rollout ([cb5828b](https://github.com/tutur3u/platform/commit/cb5828bc3cc16ba2cf1b823e8af0841c6f663e8f))
* open pay billing links in new tabs ([c6c565f](https://github.com/tutur3u/platform/commit/c6c565f56bc08252fce1a1b96aed9c22b778b11c))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **satellite:** align sidebar workspace spacing ([199de40](https://github.com/tutur3u/platform/commit/199de404c484f626f9763af7bd82bd808369c081))
* **security:** enforce infrastructure workspace permissions ([00b469c](https://github.com/tutur3u/platform/commit/00b469c2345e9f13cf44ed27322e6536eaa90faa))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** hydrate shared profile data ([7890e61](https://github.com/tutur3u/platform/commit/7890e61a86557bde1460526e0f0cfeed6ec30440))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **storefront:** show uploaded bundle images ([beff755](https://github.com/tutur3u/platform/commit/beff75501d8b6ecd54aa3f62b55fc3cbed269279))
* **tanstack:** align migrated marketing routes ([6337286](https://github.com/tutur3u/platform/commit/6337286daa4d820be286a958875af0fba0f7bc7d))
* **tasks:** guarantee root workspace resolution ([94f674d](https://github.com/tutur3u/platform/commit/94f674d1808365f89573a10b559974856a03b434))
* **tasks:** localize root proxy rewrites ([83109f9](https://github.com/tutur3u/platform/commit/83109f9fc50e6f27dc11fb5e989c6cc8081acd67))
* **ui:** make member management mobile responsive ([104c812](https://github.com/tutur3u/platform/commit/104c8120949ef34bfdc48da74fdc0e2d35eb4ce7))
* **ui:** refine member access settings ([b5b1ebf](https://github.com/tutur3u/platform/commit/b5b1ebf49a4a3b93532da74357899927f6e5d988))
* **ui:** unify workspace access and sidebar controls ([450183e](https://github.com/tutur3u/platform/commit/450183ef78af8e09a386bebb93be7018379c5152))
* **web:** harden prerender client boundaries ([ab1596a](https://github.com/tutur3u/platform/commit/ab1596a769e5a6ae43b0247c651ecbecea52d20d))
* **web:** isolate UI docs navigation controls ([94741d3](https://github.com/tutur3u/platform/commit/94741d3bed9ea9e7aab68efe0d9084eabdd1272f))
* **web:** repair Mira model picker routing ([5ad8a23](https://github.com/tutur3u/platform/commit/5ad8a231c5b9e3e955ec0deee0bc5ef5c9056868))
* **web:** restore changelog preview build ([7c85f52](https://github.com/tutur3u/platform/commit/7c85f52f5f3f7f72d9eae9731e4dea578f0fadae))
* **web:** restore hidden workspace selector spacing ([da28160](https://github.com/tutur3u/platform/commit/da281609f22b72d147a25b054b3c2a7380889ff3))
* **web:** route the QR generator to the tools app ([424dbfd](https://github.com/tutur3u/platform/commit/424dbfd83e7e13e066afec6a63c5fe5576001d75))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))


### Performance Improvements

* **web:** optimize landing page ([32a3023](https://github.com/tutur3u/platform/commit/32a3023e6f2902b8b58c3cdf73cf54eb793e5ecb))
* **web:** smooth mobile landing sections ([d3fae9a](https://github.com/tutur3u/platform/commit/d3fae9a1258ed0736a2b3bc43552c87468353e59))
</details>

<details><summary>apps: 0.11.0</summary>

## [0.11.0](https://github.com/tutur3u/platform/compare/apps-v0.10.0...apps-v0.11.0) (2026-07-24)


### Features

* **apps:** unify and redesign app catalog ([b679068](https://github.com/tutur3u/platform/commit/b679068339143a83b38610f363bec7f53ddc3706))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* open pay billing links in new tabs ([c6c565f](https://github.com/tutur3u/platform/commit/c6c565f56bc08252fce1a1b96aed9c22b778b11c))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>calendar: 0.16.0</summary>

## [0.16.0](https://github.com/tutur3u/platform/compare/calendar-v0.15.0...calendar-v0.16.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>chat: 0.12.0</summary>

## [0.12.0](https://github.com/tutur3u/platform/compare/chat-v0.11.0...chat-v0.12.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>cms: 0.21.0</summary>

## [0.21.0](https://github.com/tutur3u/platform/compare/cms-v0.20.0...cms-v0.21.0) (2026-07-24)


### Features

* **cms:** support Richfield external project forms ([befa92f](https://github.com/tutur3u/platform/commit/befa92f30f4e4f7f2a56a043bf79a99c153845e6))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **cms:** allow bound project member setup ([c3d420d](https://github.com/tutur3u/platform/commit/c3d420d894805efd181ab0cdfa551befaf5a5426))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
</details>

<details><summary>database: 1.20.0</summary>

## [1.20.0](https://github.com/tutur3u/platform/compare/database-v1.19.0...database-v1.20.0) (2026-07-24)


### Features

* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **inventory:** make storefront removal safe ([9dd4dc6](https://github.com/tutur3u/platform/commit/9dd4dc67ff264860e8b83785db2e2e87ec91959d))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **inventory:** repair storefront removal rollout ([cb5828b](https://github.com/tutur3u/platform/commit/cb5828bc3cc16ba2cf1b823e8af0841c6f663e8f))
</details>

<details><summary>drive: 0.17.0</summary>

## [0.17.0](https://github.com/tutur3u/platform/compare/drive-v0.16.0...drive-v0.17.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>external: 0.3.0</summary>

## [0.3.0](https://github.com/tutur3u/platform/compare/external-v0.2.0...external-v0.3.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
</details>

<details><summary>finance: 0.18.0</summary>

## [0.18.0](https://github.com/tutur3u/platform/compare/finance-v0.17.0...finance-v0.18.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>hive: 0.12.0</summary>

## [0.12.0](https://github.com/tutur3u/platform/compare/hive-v0.11.0...hive-v0.12.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>hive-realtime: 0.6.0</summary>

## [0.6.0](https://github.com/tutur3u/platform/compare/hive-realtime-v0.5.0...hive-realtime-v0.6.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>infra: 0.11.0</summary>

## [0.11.0](https://github.com/tutur3u/platform/compare/infra-v0.10.0...infra-v0.11.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **e2e:** follow satellite route ownership ([591190c](https://github.com/tutur3u/platform/commit/591190cd24aa15ba6cde1eb17a98409a461e0201))
* **infrastructure:** authorize external app registry sessions ([a09e8f7](https://github.com/tutur3u/platform/commit/a09e8f7a3290bdd814c0dddbbd9b6771db5f6ef0))
* **infrastructure:** freeze Vercel dependency installs ([96cd10c](https://github.com/tutur3u/platform/commit/96cd10cd0f59d32a4ed1570944d469cfb3418393))
* **infrastructure:** guard whitelist request rendering ([a84acac](https://github.com/tutur3u/platform/commit/a84acacbb1de012293f76ab2cf60fd014e89478c))
* **infrastructure:** own admin APIs and paginate models ([a73514c](https://github.com/tutur3u/platform/commit/a73514cbdac132a9bd05f69979cd48561a223ee0))
* **infrastructure:** own AI credit admin APIs ([4606857](https://github.com/tutur3u/platform/commit/46068572bb741155973a7602e21026b8e8beb02b))
* **infrastructure:** pin Vercel Bun installer ([2dcaef0](https://github.com/tutur3u/platform/commit/2dcaef0dd6d87a89ebef87b34368ba926d949b50))
* **infrastructure:** restore production builds ([a9adc4a](https://github.com/tutur3u/platform/commit/a9adc4adc728114d7153511e77dbfddd58714700))
* **infrastructure:** use satellite database runtime ([ee4044e](https://github.com/tutur3u/platform/commit/ee4044edada1b69615e2cb62765e81c51c315d2e))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **security:** enforce infrastructure workspace permissions ([00b469c](https://github.com/tutur3u/platform/commit/00b469c2345e9f13cf44ed27322e6536eaa90faa))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>inventory: 0.18.0</summary>

## [0.18.0](https://github.com/tutur3u/platform/compare/inventory-v0.17.0...inventory-v0.18.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** add POS device management ([822a171](https://github.com/tutur3u/platform/commit/822a171ae280511d6453fd5547f584f9c796d077))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** authorize admin POS fallback ([9ba0fbc](https://github.com/tutur3u/platform/commit/9ba0fbc6765913a83b5ba1a5b1709a608eb7f46c))
* **inventory:** distinguish Square POS device paths ([4654605](https://github.com/tutur3u/platform/commit/4654605a366a00134b0a9a27a1dd2124f579c35c))
* **inventory:** make storefront removal safe ([9dd4dc6](https://github.com/tutur3u/platform/commit/9dd4dc67ff264860e8b83785db2e2e87ec91959d))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
</details>

<details><summary>storefront: 0.17.0</summary>

## [0.17.0](https://github.com/tutur3u/platform/compare/storefront-v0.16.0...storefront-v0.17.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** add POS device management ([822a171](https://github.com/tutur3u/platform/commit/822a171ae280511d6453fd5547f584f9c796d077))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** authorize admin POS fallback ([9ba0fbc](https://github.com/tutur3u/platform/commit/9ba0fbc6765913a83b5ba1a5b1709a608eb7f46c))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>tanstack-web: 0.13.0</summary>

## [0.13.0](https://github.com/tutur3u/platform/compare/tanstack-web-v0.12.0...tanstack-web-v0.13.0) (2026-07-24)


### Features

* **cms:** support Richfield external project forms ([befa92f](https://github.com/tutur3u/platform/commit/befa92f30f4e4f7f2a56a043bf79a99c153845e6))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** drop the hero badge and rebuild the product frame ([b3259df](https://github.com/tutur3u/platform/commit/b3259df881968f03dbb4c5b28c5a30a6a236fd52))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** align marketing migration checks ([7a94038](https://github.com/tutur3u/platform/commit/7a940387ca1a3cfa11b35e0109156c1816610558))
* **ci:** align tanstack public route assertions ([3cf9547](https://github.com/tutur3u/platform/commit/3cf9547dd5e711a284c6e7bd84e3ed9bc4f14cd9))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **infrastructure:** own AI credit admin APIs ([4606857](https://github.com/tutur3u/platform/commit/46068572bb741155973a7602e21026b8e8beb02b))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **tanstack:** align migrated marketing routes ([6337286](https://github.com/tutur3u/platform/commit/6337286daa4d820be286a958875af0fba0f7bc7d))
* **web:** route the QR generator to the tools app ([424dbfd](https://github.com/tutur3u/platform/commit/424dbfd83e7e13e066afec6a63c5fe5576001d75))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>learn: 0.12.0</summary>

## [0.12.0](https://github.com/tutur3u/platform/compare/learn-v0.11.0...learn-v0.12.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>mail: 0.10.0</summary>

## [0.10.0](https://github.com/tutur3u/platform/compare/mail-v0.9.0...mail-v0.10.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>meet: 0.15.0</summary>

## [0.15.0](https://github.com/tutur3u/platform/compare/meet-v0.14.0...meet-v0.15.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))
* **web:** refine marketing experience ([c7f1cec](https://github.com/tutur3u/platform/commit/c7f1cec0dd667e6d5f59aaf0bab82069b79c7376))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>mind: 0.10.0</summary>

## [0.10.0](https://github.com/tutur3u/platform/compare/mind-v0.9.0...mind-v0.10.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>nova: 0.28.0</summary>

## [0.28.0](https://github.com/tutur3u/platform/compare/nova-v0.27.0...nova-v0.28.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))
* **web:** refine marketing experience ([c7f1cec](https://github.com/tutur3u/platform/commit/c7f1cec0dd667e6d5f59aaf0bab82069b79c7376))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>playground: 0.3.0</summary>

## [0.3.0](https://github.com/tutur3u/platform/compare/playground-v0.2.0...playground-v0.3.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>tools: 0.9.0</summary>

## [0.9.0](https://github.com/tutur3u/platform/compare/tools-v0.8.0...tools-v0.9.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>rewise: 0.28.0</summary>

## [0.28.0](https://github.com/tutur3u/platform/compare/rewise-v0.27.0...rewise-v0.28.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>shortener: 0.10.0</summary>

## [0.10.0](https://github.com/tutur3u/platform/compare/shortener-v0.9.0...shortener-v0.10.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>tasks: 0.17.0</summary>

## [0.17.0](https://github.com/tutur3u/platform/compare/tasks-v0.16.0...tasks-v0.17.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **tasks:** guarantee root workspace resolution ([94f674d](https://github.com/tutur3u/platform/commit/94f674d1808365f89573a10b559974856a03b434))
* **tasks:** localize root proxy rewrites ([83109f9](https://github.com/tutur3u/platform/commit/83109f9fc50e6f27dc11fb5e989c6cc8081acd67))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>teach: 0.12.0</summary>

## [0.12.0](https://github.com/tutur3u/platform/compare/teach-v0.11.0...teach-v0.12.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>pay: 0.7.0</summary>

## [0.7.0](https://github.com/tutur3u/platform/compare/pay-v0.6.0...pay-v0.7.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
</details>

<details><summary>contacts: 0.7.0</summary>

## [0.7.0](https://github.com/tutur3u/platform/compare/contacts-v0.6.0...contacts-v0.7.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>forms: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/forms-v0.1.0...forms-v0.2.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>track: 0.15.0</summary>

## [0.15.0](https://github.com/tutur3u/platform/compare/track-v0.14.0...track-v0.15.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>ai: 0.4.0</summary>

## [0.4.0](https://github.com/tutur3u/platform/compare/ai-v0.3.0...ai-v0.4.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* **ai:** repair Mira reasoning streams ([c04386a](https://github.com/tutur3u/platform/commit/c04386a9742c85d0af149d27850d7e6c591a54bc))
</details>

<details><summary>apis: 0.10.0</summary>

## [0.10.0](https://github.com/tutur3u/platform/compare/apis-v0.9.2...apis-v0.10.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>auth: 0.3.0</summary>

## [0.3.0](https://github.com/tutur3u/platform/compare/auth-v0.2.5...auth-v0.3.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>education-core: 0.4.0</summary>

## [0.4.0](https://github.com/tutur3u/platform/compare/education-core-v0.3.0...education-core-v0.4.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>finance-core: 0.4.0</summary>

## [0.4.0](https://github.com/tutur3u/platform/compare/finance-core-v0.3.1...finance-core-v0.4.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>payment-core: 0.4.0</summary>

## [0.4.0](https://github.com/tutur3u/platform/compare/payment-core-v0.3.1...payment-core-v0.4.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
</details>

<details><summary>email-service: 0.5.0</summary>

## [0.5.0](https://github.com/tutur3u/platform/compare/email-service-v0.4.0...email-service-v0.5.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>games: 0.1.0</summary>

## [0.1.0](https://github.com/tutur3u/platform/compare/games-v0.0.1...games-v0.1.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>google: 0.1.0</summary>

## [0.1.0](https://github.com/tutur3u/platform/compare/google-v0.0.3...google-v0.1.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>hive-ui: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/hive-ui-v0.1.1...hive-ui-v0.2.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>hooks: 0.1.0</summary>

## [0.1.0](https://github.com/tutur3u/platform/compare/hooks-v0.0.2...hooks-v0.1.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>icons: 0.1.0</summary>

## [0.1.0](https://github.com/tutur3u/platform/compare/icons-v0.0.6...icons-v0.1.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>internal-api: 0.21.0</summary>

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
</details>

<details><summary>inventory-core: 0.6.0</summary>

## [0.6.0](https://github.com/tutur3u/platform/compare/inventory-core-v0.5.0...inventory-core-v0.6.0) (2026-07-24)


### Features

* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* **inventory:** make storefront removal safe ([9dd4dc6](https://github.com/tutur3u/platform/commit/9dd4dc67ff264860e8b83785db2e2e87ec91959d))
* **inventory:** repair storefront removal rollout ([cb5828b](https://github.com/tutur3u/platform/commit/cb5828bc3cc16ba2cf1b823e8af0841c6f663e8f))
* **storefront:** show uploaded bundle images ([beff755](https://github.com/tutur3u/platform/commit/beff75501d8b6ecd54aa3f62b55fc3cbed269279))
</details>

<details><summary>masonry: 0.5.0</summary>

## [0.5.0](https://github.com/tutur3u/platform/compare/masonry-v0.4.3...masonry-v0.5.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>microsoft: 0.1.0</summary>

## [0.1.0](https://github.com/tutur3u/platform/compare/microsoft-v0.0.1...microsoft-v0.1.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>mind-core: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/mind-core-v0.1.0...mind-core-v0.2.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>mind-ui: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/mind-ui-v0.1.1...mind-ui-v0.2.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>offline: 0.1.0</summary>

## [0.1.0](https://github.com/tutur3u/platform/compare/offline-v0.0.3...offline-v0.1.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
</details>

<details><summary>payment: 0.4.0</summary>

## [0.4.0](https://github.com/tutur3u/platform/compare/payment-v0.3.1...payment-v0.4.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>satellite: 0.10.0</summary>

## [0.10.0](https://github.com/tutur3u/platform/compare/satellite-v0.9.0...satellite-v0.10.0) (2026-07-24)


### Features

* **apps:** unify and redesign app catalog ([b679068](https://github.com/tutur3u/platform/commit/b679068339143a83b38610f363bec7f53ddc3706))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))


### Bug Fixes

* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* open pay billing links in new tabs ([c6c565f](https://github.com/tutur3u/platform/commit/c6c565f56bc08252fce1a1b96aed9c22b778b11c))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **satellite:** align sidebar workspace spacing ([199de40](https://github.com/tutur3u/platform/commit/199de404c484f626f9763af7bd82bd808369c081))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** hydrate shared profile data ([7890e61](https://github.com/tutur3u/platform/commit/7890e61a86557bde1460526e0f0cfeed6ec30440))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **ui:** make member management mobile responsive ([104c812](https://github.com/tutur3u/platform/commit/104c8120949ef34bfdc48da74fdc0e2d35eb4ce7))
* **ui:** refine member access settings ([b5b1ebf](https://github.com/tutur3u/platform/commit/b5b1ebf49a4a3b93532da74357899927f6e5d988))
* **ui:** unify workspace access and sidebar controls ([450183e](https://github.com/tutur3u/platform/commit/450183ef78af8e09a386bebb93be7018379c5152))
</details>

<details><summary>sdk: 0.16.0</summary>

## [0.16.0](https://github.com/tutur3u/platform/compare/sdk-v0.15.1...sdk-v0.16.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>storage-core: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/storage-core-v0.1.1...storage-core-v0.2.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>supabase: 0.5.0</summary>

## [0.5.0](https://github.com/tutur3u/platform/compare/supabase-v0.4.1...supabase-v0.5.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>tasks-api: 0.3.0</summary>

## [0.3.0](https://github.com/tutur3u/platform/compare/tasks-api-v0.2.1...tasks-api-v0.3.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>tasks-ui: 0.3.0</summary>

## [0.3.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.2.1...tasks-ui-v0.3.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
</details>

<details><summary>transactional: 1.1.0</summary>

## [1.1.0](https://github.com/tutur3u/platform/compare/transactional-v1.0.2...transactional-v1.1.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>trigger: 0.3.0</summary>

## [0.3.0](https://github.com/tutur3u/platform/compare/trigger-v0.2.0...trigger-v0.3.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
</details>

<details><summary>types: 0.20.0</summary>

## [0.20.0](https://github.com/tutur3u/platform/compare/types-v0.19.0...types-v0.20.0) (2026-07-24)


### Features

* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **inventory:** make storefront removal safe ([9dd4dc6](https://github.com/tutur3u/platform/commit/9dd4dc67ff264860e8b83785db2e2e87ec91959d))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
</details>

<details><summary>ui: 0.20.0</summary>

## [0.20.0](https://github.com/tutur3u/platform/compare/ui-v0.19.1...ui-v0.20.0) (2026-07-24)


### Features

* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))
* **web:** improve workspace navigation context ([73959e3](https://github.com/tutur3u/platform/commit/73959e3c6745f60513d23740f30024c5d24e7ee4))
* **web:** redesign marketing landing page ([13ede78](https://github.com/tutur3u/platform/commit/13ede784ac03af9f25bbb7df61095826c335e002))
* **web:** refine marketing experience ([c7f1cec](https://github.com/tutur3u/platform/commit/c7f1cec0dd667e6d5f59aaf0bab82069b79c7376))


### Bug Fixes

* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **ui:** make member management mobile responsive ([104c812](https://github.com/tutur3u/platform/commit/104c8120949ef34bfdc48da74fdc0e2d35eb4ce7))
* **ui:** refine member access settings ([b5b1ebf](https://github.com/tutur3u/platform/commit/b5b1ebf49a4a3b93532da74357899927f6e5d988))
* **ui:** unify workspace access and sidebar controls ([450183e](https://github.com/tutur3u/platform/commit/450183ef78af8e09a386bebb93be7018379c5152))
* **web:** harden prerender client boundaries ([ab1596a](https://github.com/tutur3u/platform/commit/ab1596a769e5a6ae43b0247c651ecbecea52d20d))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
</details>

<details><summary>users-core: 0.5.0</summary>

## [0.5.0](https://github.com/tutur3u/platform/compare/users-core-v0.4.2...users-core-v0.5.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
</details>

<details><summary>users-ui: 0.5.0</summary>

## [0.5.0](https://github.com/tutur3u/platform/compare/users-ui-v0.4.1...users-ui-v0.5.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

<details><summary>utils: 0.18.0</summary>

## [0.18.0](https://github.com/tutur3u/platform/compare/utils-v0.17.0...utils-v0.18.0) (2026-07-24)


### Features

* **apps:** unify and redesign app catalog ([b679068](https://github.com/tutur3u/platform/commit/b679068339143a83b38610f363bec7f53ddc3706))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
</details>

<details><summary>vercel: 0.1.0</summary>

## [0.1.0](https://github.com/tutur3u/platform/compare/vercel-v0.0.1...vercel-v0.1.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).
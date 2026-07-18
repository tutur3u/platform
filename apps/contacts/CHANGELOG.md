# Changelog

## [0.5.0](https://github.com/tutur3u/platform/compare/contacts-v0.4.0...contacts-v0.5.0) (2026-07-18)


### Features

* **inventory:** unify promotions and referrals ([ea9b3be](https://github.com/tutur3u/platform/commit/ea9b3be2ea762b216522da4b5d6c1b8242b4c3b7))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))


### Bug Fixes

* **contacts:** own post approval APIs ([632aa32](https://github.com/tutur3u/platform/commit/632aa322fae28d43c39d63e2d033189065735376))
* **contacts:** restore audit log exports ([4bae50b](https://github.com/tutur3u/platform/commit/4bae50b7b560d3af5fa4b1af42c83db1d0987f02))
* **contacts:** restore coupon discovery ([cb7dfea](https://github.com/tutur3u/platform/commit/cb7dfea49da9f72e18321f60d7e95c7f056fbea4))
* **contacts:** restore user group and report mutations ([0f3f12d](https://github.com/tutur3u/platform/commit/0f3f12d5291b3a2d3635fc3bde193cbe5f3e8052))
* **contacts:** restore workspace posts ([df08eae](https://github.com/tutur3u/platform/commit/df08eae5334a55412bceb994a878d7c3a53d752e))
* **contacts:** stream group overview sections ([349e68f](https://github.com/tutur3u/platform/commit/349e68f6901b1bdad8fcc9c418d6ddb9b1b176e4))
* **mobile:** preserve bearer auth across satellites ([f890170](https://github.com/tutur3u/platform/commit/f89017044cf3aaaa6a1b15c31c64a81d75cfdab2))
* **tasks:** repair task media permissions ([28a0bf1](https://github.com/tutur3u/platform/commit/28a0bf1f1ff11359828a335ac81bb20860062942))

## [0.4.0](https://github.com/tutur3u/platform/compare/contacts-v0.3.0...contacts-v0.4.0) (2026-07-13)


### Features

* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **contacts:** serve notifications locally ([0fd7a89](https://github.com/tutur3u/platform/commit/0fd7a89f8bf15e6cd8146382d5b659cceed84751))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))


### Bug Fixes

* **contacts:** authenticate users database requests ([54ddc74](https://github.com/tutur3u/platform/commit/54ddc741b9833ca835ce13adabb196aabff78fb8))
* **contacts:** complete CRM translations ([0a9ba1c](https://github.com/tutur3u/platform/commit/0a9ba1c12a32238380be1ae38d896f229fdd8b56))
* **contacts:** complete database translations ([d20b991](https://github.com/tutur3u/platform/commit/d20b991e01a4072659f1987ebb5fd960dc6708cf))
* **contacts:** complete report translations ([61c77f0](https://github.com/tutur3u/platform/commit/61c77f07c4b7d069388cf231df0bf605579636e3))
* **contacts:** consolidate manager profiles ([69529a3](https://github.com/tutur3u/platform/commit/69529a30cb276ea31d7fa191a823bb9949751058))
* **contacts:** load group metrics and calendar ([8f3d310](https://github.com/tutur3u/platform/commit/8f3d3106aa3aec64c935c2ad8e1dc0135d9f4bd8))
* **contacts:** own settings and profile APIs ([d809fe0](https://github.com/tutur3u/platform/commit/d809fe00699f7837b1ac829e5f8b92491e5f822c))
* **contacts:** own workspace user mutations ([21ab1fb](https://github.com/tutur3u/platform/commit/21ab1fbbf5cf6e2a06274dbfba2616aac1f0e481))
* **contacts:** restore group and report operations ([8760868](https://github.com/tutur3u/platform/commit/8760868f3b5a721b0e2712a964fb5ec71ec14048))
* **contacts:** restore group post mutations ([fe621e4](https://github.com/tutur3u/platform/commit/fe621e4d7e4126f705082cc3e815aafdeebe535a))
* **platform:** address attendance and invoice feedback ([8d2a537](https://github.com/tutur3u/platform/commit/8d2a53782d01427839607c7b0d90eaa3ecc5a1d8))

## [0.3.0](https://github.com/tutur3u/platform/compare/contacts-v0.2.0...contacts-v0.3.0) (2026-07-11)


### Features

* **contacts:** add workspace dashboard shell + users/CRM navigation ([c0d0317](https://github.com/tutur3u/platform/commit/c0d03178c56a3189517fe5923912d9fd5f8f4882))
* **contacts:** migrate feedbacks, tutoring, guest-leads to apps/contacts ([47bafeb](https://github.com/tutur3u/platform/commit/47bafeb361950d664deb0419004c8b9646c254d0))
* **contacts:** migrate reports + groups and complete the users cutover ([2ee89cd](https://github.com/tutur3u/platform/commit/2ee89cd2257c2a9824df53d4be99436416d85c13))
* **contacts:** migrate users [userId]/follow-up; fix owned-route matcher ([765b87a](https://github.com/tutur3u/platform/commit/765b87a5adb40318296d24b4c56347f27f65c8db))
* **contacts:** migrate users approvals module, extracting shared parts to packages ([e66ae32](https://github.com/tutur3u/platform/commit/e66ae326f89bec7e43ef9bbd3650dbf2f8b41814))
* **contacts:** migrate users attendance; add satellite-safe workspace-user link helper ([8f53453](https://github.com/tutur3u/platform/commit/8f534533793af8d25e7c2eca6e0147e459d78bbe))
* **contacts:** migrate users group-tags module ([bcc61e4](https://github.com/tutur3u/platform/commit/bcc61e4d20730a09505159e0175ac3a0838d54ad))
* **contacts:** migrate users topic-announcements module ([01e19ab](https://github.com/tutur3u/platform/commit/01e19ab60461ccd94a0374bed74ce6e4d5d38a3b))
* **contacts:** migrate users/database UI into apps/contacts ([d3aa461](https://github.com/tutur3u/platform/commit/d3aa461cea536f80428536b13be1232d277cd5c3))
* **contacts:** migrate users/structure (org chart) to apps/contacts ([93f2cb5](https://github.com/tutur3u/platform/commit/93f2cb500cf7aa1a957ca001607f034832f0761e))
* **contacts:** move user-management settings into apps/contacts dialog ([b6a3efe](https://github.com/tutur3u/platform/commit/b6a3efe619499241199b2c6da565c92f343448cf))
* **contacts:** redirect non-migrated workspace routes to apps/web ([f5a6518](https://github.com/tutur3u/platform/commit/f5a6518a85b4cb4c8f3e28e9fcaaf959c864fe07))
* **contacts:** scaffold contacts.tuturuuu.com satellite shell + monorepo registration ([7e335fc](https://github.com/tutur3u/platform/commit/7e335fc036c4a45ed189095ecd10a43ee002294b))


### Bug Fixes

* **ci:** restore repository validation parity ([db6afe4](https://github.com/tutur3u/platform/commit/db6afe441a5d51fccb73ea384724add7b8577ace))
* **contacts:** add missing shared i18n namespaces; move contacts into the checked apps ([0971c8f](https://github.com/tutur3u/platform/commit/0971c8fe6724ad0150c9a80cb439ecd202aa82b6))
* **contacts:** backfill shared-shell translation keys and close the scan gap ([90b4672](https://github.com/tutur3u/platform/commit/90b4672f8cc624a6172e1969603908de8aae6ddb))
* **contacts:** drop force-dynamic segment config incompatible with cacheComponents ([db263e1](https://github.com/tutur3u/platform/commit/db263e1395c172a5f2554f78b725273454bad3de))
* **contacts:** fall back to first workspace, not the root workspace ([937d8d0](https://github.com/tutur3u/platform/commit/937d8d029586e9152b97711ff1a962f6c010ee34))
* **contacts:** opt authed pages into request-time rendering with connection() ([df7288c](https://github.com/tutur3u/platform/commit/df7288c7f61652a32c87d2638d2cb0b89b464989))
* **contacts:** provide nuqs adapter ([17f4ac4](https://github.com/tutur3u/platform/commit/17f4ac46c767a0b6744645105e13bdf8db44475c))
* **contacts:** redirect app entry to the default workspace ([244e852](https://github.com/tutur3u/platform/commit/244e852881adfc21121d74f1233057a06bb6c944))
* **contacts:** resolve workspace + permissions from the app session ([55cffe4](https://github.com/tutur3u/platform/commit/55cffe4b8ac8f2b335416f35b43a2fd39b11a37c))
* **contacts:** stop catch-all routes from shadowing the /api → web proxy ([852a79b](https://github.com/tutur3u/platform/commit/852a79bee5453ab019496351075c3613f7b48a84))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.2.0](https://github.com/tutur3u/platform/compare/contacts-v0.1.0...contacts-v0.2.0) (2026-07-11)


### Features

* **contacts:** add workspace dashboard shell + users/CRM navigation ([c0d0317](https://github.com/tutur3u/platform/commit/c0d03178c56a3189517fe5923912d9fd5f8f4882))
* **contacts:** migrate feedbacks, tutoring, guest-leads to apps/contacts ([47bafeb](https://github.com/tutur3u/platform/commit/47bafeb361950d664deb0419004c8b9646c254d0))
* **contacts:** migrate reports + groups and complete the users cutover ([2ee89cd](https://github.com/tutur3u/platform/commit/2ee89cd2257c2a9824df53d4be99436416d85c13))
* **contacts:** migrate users [userId]/follow-up; fix owned-route matcher ([765b87a](https://github.com/tutur3u/platform/commit/765b87a5adb40318296d24b4c56347f27f65c8db))
* **contacts:** migrate users approvals module, extracting shared parts to packages ([e66ae32](https://github.com/tutur3u/platform/commit/e66ae326f89bec7e43ef9bbd3650dbf2f8b41814))
* **contacts:** migrate users attendance; add satellite-safe workspace-user link helper ([8f53453](https://github.com/tutur3u/platform/commit/8f534533793af8d25e7c2eca6e0147e459d78bbe))
* **contacts:** migrate users group-tags module ([bcc61e4](https://github.com/tutur3u/platform/commit/bcc61e4d20730a09505159e0175ac3a0838d54ad))
* **contacts:** migrate users topic-announcements module ([01e19ab](https://github.com/tutur3u/platform/commit/01e19ab60461ccd94a0374bed74ce6e4d5d38a3b))
* **contacts:** migrate users/database UI into apps/contacts ([d3aa461](https://github.com/tutur3u/platform/commit/d3aa461cea536f80428536b13be1232d277cd5c3))
* **contacts:** migrate users/structure (org chart) to apps/contacts ([93f2cb5](https://github.com/tutur3u/platform/commit/93f2cb500cf7aa1a957ca001607f034832f0761e))
* **contacts:** move user-management settings into apps/contacts dialog ([b6a3efe](https://github.com/tutur3u/platform/commit/b6a3efe619499241199b2c6da565c92f343448cf))
* **contacts:** redirect non-migrated workspace routes to apps/web ([f5a6518](https://github.com/tutur3u/platform/commit/f5a6518a85b4cb4c8f3e28e9fcaaf959c864fe07))
* **contacts:** scaffold contacts.tuturuuu.com satellite shell + monorepo registration ([7e335fc](https://github.com/tutur3u/platform/commit/7e335fc036c4a45ed189095ecd10a43ee002294b))


### Bug Fixes

* **ci:** restore repository validation parity ([db6afe4](https://github.com/tutur3u/platform/commit/db6afe441a5d51fccb73ea384724add7b8577ace))
* **contacts:** add missing shared i18n namespaces; move contacts into the checked apps ([0971c8f](https://github.com/tutur3u/platform/commit/0971c8fe6724ad0150c9a80cb439ecd202aa82b6))
* **contacts:** backfill shared-shell translation keys and close the scan gap ([90b4672](https://github.com/tutur3u/platform/commit/90b4672f8cc624a6172e1969603908de8aae6ddb))
* **contacts:** drop force-dynamic segment config incompatible with cacheComponents ([db263e1](https://github.com/tutur3u/platform/commit/db263e1395c172a5f2554f78b725273454bad3de))
* **contacts:** fall back to first workspace, not the root workspace ([937d8d0](https://github.com/tutur3u/platform/commit/937d8d029586e9152b97711ff1a962f6c010ee34))
* **contacts:** opt authed pages into request-time rendering with connection() ([df7288c](https://github.com/tutur3u/platform/commit/df7288c7f61652a32c87d2638d2cb0b89b464989))
* **contacts:** redirect app entry to the default workspace ([244e852](https://github.com/tutur3u/platform/commit/244e852881adfc21121d74f1233057a06bb6c944))
* **contacts:** resolve workspace + permissions from the app session ([55cffe4](https://github.com/tutur3u/platform/commit/55cffe4b8ac8f2b335416f35b43a2fd39b11a37c))
* **contacts:** stop catch-all routes from shadowing the /api → web proxy ([852a79b](https://github.com/tutur3u/platform/commit/852a79bee5453ab019496351075c3613f7b48a84))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

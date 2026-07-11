# Changelog

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

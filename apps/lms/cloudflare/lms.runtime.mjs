import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

test(
  'the emitted LMS Worker serves the apex and keeps legacy hosts at ingress',
  { timeout: 60000 },
  async (t) => {
    const app = fileURLToPath(new URL('../', import.meta.url));
    const { configPath, config } = readNativeRuntimeConfig(app);
    assert.equal(config.name, 'tuturuuu-lms');
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.deepEqual(config.routes ?? [], []);
    const root = dirname(configPath);
    const assets = resolve(root, config.assets.directory);
    const area = (name) => async (request) =>
      Response.json({ area: name, url: request.url, method: request.method });
    const entry = resolve(root, config.main);
    const chunks = (await readdir(root, { recursive: true }))
      .filter((name) => /\.m?js$/u.test(name))
      .map((name) => resolve(root, name))
      .filter((path) => path !== entry)
      .sort();
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: [entry, ...chunks].map((path) => ({ type: 'ESModule', path })),
        modulesRoot: root,
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        bindings: config.vars,
        outboundService: () => new Response('Outbound denied', { status: 500 }),
        serviceBindings: {
          ASSETS: async (request) => {
            const path = new URL(request.url).pathname;
            if (!/^\/assets\/[\w.-]+\.(?:css|js)$/u.test(path)) {
              return new Response(null, { status: 404 });
            }
            return new Response(
              await readFile(resolve(assets, path.slice(1))),
              {
                headers: {
                  'Cache-Control': 'public, max-age=0',
                  'Content-Type': path.endsWith('.css')
                    ? 'text/css'
                    : 'text/javascript',
                },
              }
            );
          },
          TEACH: area('teach'),
          LEARN: area('learn'),
        },
      })
    );
    t.after(() => runtime.dispose());
    assert.match(process.env.LMS_SOURCE_SHA ?? '', /^[0-9a-f]{40}$/u);
    const call = (path, init) =>
      runtime.dispatchFetch(`https://tuturuuu.com${path}`, init);
    const landing = await call('/lms?x=1&x=2', {
      headers: { 'Accept-Language': 'vi' },
    });
    assert.equal(landing.status, 200, 'Bare canonical mount renders the index');
    assert.match(landing.headers.get('x-robots-tag'), /noindex/u);
    assert.match(landing.headers.get('cache-control'), /no-store/u);
    const html = await landing.text();
    assert.match(html, /Hệ thống quản lý học tập/u);
    assert.match(html, /rel="canonical" href="https:\/\/tuturuuu\.com\/lms"/u);
    assert.match(html, /href="\/lms\/teach\/dashboard"/u);
    assert.match(html, /href="\/lms\/learn\/dashboard"/u);
    const assetPaths = [
      ...new Set(html.match(/\/lms\/assets\/[\w.-]+\.(?:css|js)/gu)),
    ];
    assert.ok(assetPaths.length > 0, 'The landing must emit mounted assets');
    for (const path of assetPaths) {
      const asset = await call(path);
      assert.equal(asset.status, 200, path);
      assert.match(asset.headers.get('cache-control'), /immutable/u);
      await asset.arrayBuffer();
    }

    const build = await call('/lms/api/build-info');
    assert.equal(build.status, 200);
    assert.equal((await build.json()).commitHash, process.env.LMS_SOURCE_SHA);
    for (const [name, path, method] of [
      ['teach', '/lms/teach/vi/w/courses/c/l', 'GET'],
      ['learn', '/lms/learn/parent-invite?token=fixture&x=1&x=2', 'GET'],
      ['teach', '/lms/teach/api/v1/workspaces/w/teach/save', 'POST'],
    ]) {
      const response = await call(path, { method });
      assert.deepEqual(await response.json(), {
        area: name,
        url: `https://tuturuuu.com${path}`,
        method,
      });
    }
    for (const host of [
      'lms.tuturuuu.com',
      'teach.tuturuuu.com',
      'learn.tuturuuu.com',
    ]) {
      const response = await runtime.dispatchFetch(`https://${host}/lms`);
      assert.equal(response.status, 404, host);
      await response.text();
    }
  }
);

// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BaseServer from 'next/dist/server/base-server';
import { PHASE_PRODUCTION_SERVER } from 'next/constants';
import loadConfig from 'next/dist/server/config';
import { getNextConfigRuntime } from 'next/dist/server/config-shared';
import { setupFsCheck } from 'next/dist/server/lib/router-utils/filesystem';
import { getMaybePagePath } from 'next/dist/server/require';
import type { RouteDefinition } from 'next/dist/server/route-definitions/route-definition';
import type { RouteMatch } from 'next/dist/server/route-matches/route-match';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { guardWebApiCsrf, WEB_SESSION_CLEARING_PATHS } from './csrf';

const paths = [...WEB_SESSION_CLEARING_PATHS];
let directory: string;
let checker: Awaited<ReturnType<typeof setupFsCheck>>;
let renderServer: { getRouteMatch(pathname: string): RouteMatch | null };

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'web-csrf-dispatch-'));
  const dist = join(directory, '.next');
  await mkdir(join(dist, 'server'), { recursive: true });
  await mkdir(join(dist, 'static'), { recursive: true });
  const manifests = {
    'routes-manifest.json': {
      dataRoutes: [],
      dynamicRoutes: [],
      redirects: [],
      headers: [],
      onMatchHeaders: [],
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
    },
    'server/preview-props.json': {},
    'server/pages-manifest.json': {},
    'server/functions-config-manifest.json': { functions: {} },
    'server/app-paths-manifest.json': Object.fromEntries(
      paths.map((path) => [`${path}/route`, `app${path}/route.js`])
    ),
    'app-path-routes-manifest.json': Object.fromEntries(
      paths.map((path) => [`${path}/route`, path])
    ),
  };
  await writeFile(join(dist, 'BUILD_ID'), 'synthetic-dispatch-fixture');
  for (const [name, value] of Object.entries(manifests)) {
    await writeFile(join(dist, name), JSON.stringify(value));
  }
  checker = await setupFsCheck({
    dir: directory,
    dev: false,
    config: getNextConfigRuntime(
      await loadConfig(PHASE_PRODUCTION_SERVER, directory)
    ),
  });
  // Exercise the installed render matcher without starting a server or loading
  // compiled pages. Only its manifest input is a fixture.
  renderServer = Object.assign(Object.create(BaseServer.prototype), {
    getRouteDefinitions: () =>
      paths
        .map((path) => checker.getRouteDefinition('appFile', path, undefined))
        .filter((route): route is RouteDefinition => Boolean(route)),
  });
});

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('logout dispatch with the installed production Next router', () => {
  it.each(paths)(
    'requires origin proof on the canonical route %s',
    async (path) => {
      const output = await checker.getItem(path);
      expect(output?.route?.pathname).toBe(path);
      expect(renderServer.getRouteMatch(path)?.definition.pathname).toBe(path);
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        for (const suffix of ['', '/']) {
          expect(
            guardWebApiCsrf(
              new NextRequest(`https://tuturuuu.com${path}${suffix}`, {
                method: 'POST',
                headers: { 'sec-fetch-site': 'cross-site' },
              }),
              { configuredOrigin: 'https://tuturuuu.com', mode: 'enforce' }
            )?.status
          ).toBe(403);
        }
      } finally {
        warn.mockRestore();
      }
    }
  );

  it.each(paths)(
    'does not dispatch a decoded filesystem candidate for %s',
    async (path) => {
      for (const encoded of [
        path.replace('/api/', '/%61pi/'),
        path.replace('/auth/', '/%61uth/'),
        path.replace('/logout', '/%6cogout'),
        path.replace('/auth/', '/auth%2f'),
      ]) {
        const output = await checker.getItem(encoded);
        // A filesystem hit alone does not prove a handler is reachable:
        // router-server forwards route metadata only when `output.route` exists.
        expect(output?.itemPath).toBe(path);
        expect(output?.route).toBeUndefined();
        expect(renderServer.getRouteMatch(encoded)).toBeNull();
        expect(
          getMaybePagePath(encoded, join(directory, '.next'), undefined, true)
        ).toBeNull();
      }
    }
  );

  it.each(['%2f', '%3f', '%23', '%5c', '%00', '%25', '%'])(
    'does not dispatch an ambiguous logout suffix %s',
    async (suffix) => {
      for (const path of paths) {
        const encoded = `${path}${suffix}`;
        expect(await checker.getItem(encoded)).toBeNull();
        expect(renderServer.getRouteMatch(encoded)).toBeNull();
        expect(
          getMaybePagePath(encoded, join(directory, '.next'), undefined, true)
        ).toBeNull();
      }
    }
  );

  it.each(paths)(
    'URL dot-segment normalization returns the guarded route %s',
    (path) => {
      const url = new URL(
        `${path.slice(0, path.lastIndexOf('/'))}/unused/%2e%2e/${path.split('/').at(-1)}`,
        'https://tuturuuu.com'
      );
      expect(url.pathname).toBe(path);
    }
  );
});

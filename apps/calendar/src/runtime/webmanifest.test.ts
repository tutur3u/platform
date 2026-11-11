import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CALENDAR_MOUNT_BASE_PATH } from '../constants/calendar-origins';
import { calendarMounts } from './calendar-mount';
import { publicAssets } from './public-assets';

interface Manifest {
  id: string;
  scope: string;
  start_url: string;
  icons: { src: string }[];
}

const publicDir = resolve(__dirname, '../../public');
const load = (name: string) =>
  JSON.parse(readFileSync(resolve(publicDir, name), 'utf8')) as Manifest;
const within = (scope: string, url: string) => url.startsWith(scope);

describe('Calendar web manifests', () => {
  it('keeps the host-root manifest at the origin root', () => {
    const manifest = load('site.webmanifest');
    expect(manifest.scope).toBe('/');
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/personal');
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      '/android-chrome-192x192.png',
      '/android-chrome-512x512.png',
    ]);
  });

  it('scopes the mounted manifest under the base path', () => {
    const base = CALENDAR_MOUNT_BASE_PATH;
    const manifest = load('site.mount.webmanifest');
    expect(manifest.scope).toBe(`${base}/`);
    expect(manifest.id).toBe(`${base}/`);
    expect(manifest.start_url).toBe(`${base}/personal`);
    expect(within(manifest.scope, manifest.start_url)).toBe(true);
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      `${base}/android-chrome-192x192.png`,
      `${base}/android-chrome-512x512.png`,
    ]);
  });

  it('serves every mounted icon from a public asset', () => {
    const base = CALENDAR_MOUNT_BASE_PATH;
    for (const icon of load('site.mount.webmanifest').icons) {
      const path = icon.src.slice(base.length);
      expect(publicAssets.has(path)).toBe(true);
      expect(existsSync(resolve(publicDir, path.slice(1)))).toBe(true);
    }
  });

  it('shares identity fields between the two manifests', () => {
    const { icons: _rootIcons, ...rootRest } = JSON.parse(
      readFileSync(resolve(publicDir, 'site.webmanifest'), 'utf8')
    );
    const { icons: _mountIcons, ...mountRest } = JSON.parse(
      readFileSync(resolve(publicDir, 'site.mount.webmanifest'), 'utf8')
    );
    const {
      id: _rootId,
      scope: _rootScope,
      start_url: _rootStart,
      ...rootShared
    } = rootRest;
    const {
      id: _mountId,
      scope: _mountScope,
      start_url: _mountStart,
      ...mountShared
    } = mountRest;
    expect(mountShared).toEqual(rootShared);
  });

  it('publishes both manifests as public assets', () => {
    expect(publicAssets.has('/site.webmanifest')).toBe(true);
    expect(publicAssets.has('/site.mount.webmanifest')).toBe(true);
  });

  it('mounts Calendar at the manifest base path', () => {
    expect(calendarMounts.basePath).toBe(CALENDAR_MOUNT_BASE_PATH);
  });
});

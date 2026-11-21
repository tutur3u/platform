import 'server-only';
import { z } from 'zod';
import {
  DESKTOP_PACKAGES,
  DESKTOP_PLATFORMS,
  DESKTOP_TAG_PATTERN,
  type DesktopRelease,
} from './desktop-downloads';
import { DESKTOP_RELEASES_WEB } from './desktop-release-assets';

const CACHE_NAME = 'tuturuuu-desktop-beta';
const CACHE_KEY = 'https://tuturuuu.com/.well-known/desktop-beta-cache-v1';
const TTL_SECONDS = 3600;
const tag = z.string().regex(DESKTOP_TAG_PATTERN);
const entry = z.object({
  savedAt: z.number().int().nonnegative(),
  release: z.object({
    tag,
    downloads: z
      .array(
        z.object({
          platform: z.enum(DESKTOP_PLATFORMS),
          tag,
          unsigned: z.boolean(),
          size: z.number().int().positive().nullable(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
      )
      .min(1)
      .max(DESKTOP_PLATFORMS.length),
  }),
});

export async function readCachedDesktopRelease(): Promise<{
  expiresAt: number;
  release: DesktopRelease;
} | null> {
  try {
    const cache = await globalThis.caches?.open(CACHE_NAME);
    const response = await cache?.match(CACHE_KEY);
    if (!response) return null;
    const stored = entry.safeParse(await response.json());
    if (!stored.success) return null;
    const { savedAt, release } = stored.data;
    const expiresAt = savedAt + TTL_SECONDS * 1000;
    if (
      savedAt > Date.now() ||
      expiresAt <= Date.now() ||
      new Set(release.downloads.map((download) => download.platform)).size !==
        release.downloads.length ||
      !release.downloads.some((download) => download.tag === release.tag)
    )
      return null;
    return {
      expiresAt,
      release: {
        tag: release.tag,
        url: `${DESKTOP_RELEASES_WEB}/tag/${release.tag}`,
        downloads: release.downloads.map((download) => {
          const { name, architecture, minimumOs } =
            DESKTOP_PACKAGES[download.platform];
          return {
            ...download,
            architecture,
            minimumOs,
            releaseUrl: `${DESKTOP_RELEASES_WEB}/tag/${download.tag}`,
            url: `${DESKTOP_RELEASES_WEB}/download/${download.tag}/${name}`,
          };
        }),
      },
    };
  } catch {
    console.warn('Desktop beta edge cache read failed');
    return null;
  }
}

export async function cacheDesktopRelease(release: DesktopRelease) {
  try {
    const cache = await globalThis.caches?.open(CACHE_NAME);
    await cache?.put(
      CACHE_KEY,
      Response.json(
        { savedAt: Date.now(), release },
        {
          headers: { 'Cache-Control': `public, max-age=${TTL_SECONDS}` },
        }
      )
    );
  } catch {
    console.warn('Desktop beta edge cache write failed');
  }
}

export async function clearCachedDesktopRelease() {
  try {
    const cache = await globalThis.caches?.open(CACHE_NAME);
    await cache?.delete(CACHE_KEY);
  } catch {
    console.warn('Desktop beta edge cache invalidation failed');
  }
}

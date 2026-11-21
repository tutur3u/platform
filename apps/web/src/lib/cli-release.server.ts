import 'server-only';
import { cacheLife } from 'next/cache';
import { CLI_PACKAGE, parseCliRelease } from './cli-release';

export async function getCliVersion() {
  'use cache';
  cacheLife({ stale: 900, revalidate: 900, expire: 86_400 });
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${CLI_PACKAGE}/latest`,
      {
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok) return null;
    return parseCliRelease(await response.json());
  } catch {
    return null;
  }
}

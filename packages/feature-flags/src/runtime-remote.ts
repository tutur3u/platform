import { featureFlagCatalog } from './catalog';
import type { CatalogFlag } from './lifecycle.mjs';
import { isUuid, type RuleEnvironment } from './rule-validation';
import { evaluateRuntimeFlag, type RuntimeDecision } from './runtime-evaluate';
import { denyRuntimeFlag, type RuntimeReaderContext } from './runtime-reader';
import {
  createRuntimeSnapshotCache,
  parseRuntimeSnapshot,
  type RuntimeSnapshot,
  type SnapshotRefresh,
} from './runtime-snapshot';

const REQUEST_TIMEOUT_MS = 2_000;

export type RemoteRuntimeEnvironment = Readonly<
  Record<string, string | undefined>
>;

export interface RemoteRuntimeReaderOptions {
  readonly environment: RuleEnvironment;
  readonly env: RemoteRuntimeEnvironment;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly flags?: readonly CatalogFlag[];
}

function snapshotUrl(raw: string | undefined, environment: RuleEnvironment) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password) return null;
    if (
      url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )
    ) {
      return null;
    }
    url.searchParams.set('environment', environment);
    return url;
  } catch {
    return null;
  }
}

export function createRemoteRuntimeReader({
  environment,
  env,
  fetch: fetchSnapshot = globalThis.fetch,
  now = Date.now,
  flags = featureFlagCatalog.flags,
}: RemoteRuntimeReaderOptions) {
  const catalog = new Map(flags.map((flag) => [flag.key, flag]));
  let etag: string | undefined;

  function remoteConfig() {
    const token = env.FEATURE_FLAGS_SNAPSHOT_TOKEN;
    if (env.FEATURE_FLAGS_REMOTE === 'off' || !token) return null;
    const url = snapshotUrl(env.FEATURE_FLAGS_SNAPSHOT_URL, environment);
    return url ? { url, token } : null;
  }

  async function refresh(
    previous: RuntimeSnapshot | null
  ): Promise<SnapshotRefresh> {
    const config = remoteConfig();
    if (!config) return { status: 'unavailable' };

    const controller = new AbortController();
    const headers = new Headers({
      Authorization: `Bearer ${config.token}`,
      'User-Agent': 'Tuturuuu-Feature-Flags/1',
    });
    if (previous && etag) headers.set('If-None-Match', etag);
    const request = async (): Promise<SnapshotRefresh> => {
      const response = await fetchSnapshot(config.url, {
        headers,
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 304) {
        const responseTag = response.headers.get('etag');
        return previous &&
          etag &&
          (responseTag === null || responseTag === etag)
          ? { status: 'unchanged' }
          : { status: 'invalid' };
      }
      if (response.status !== 200) return { status: 'unavailable' };

      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        return {
          status: error instanceof SyntaxError ? 'invalid' : 'unavailable',
        };
      }
      if (controller.signal.aborted) return { status: 'unavailable' };

      const tag = response.headers.get('etag');
      if (!tag || !/^"[\x21\x23-\x7e]+"$/.test(tag))
        return { status: 'invalid' };
      const result = parseRuntimeSnapshot(data, environment);
      if (result.status === 'ready') etag = tag;
      return result;
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SnapshotRefresh>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ status: 'unavailable' });
      }, REQUEST_TIMEOUT_MS);
    });
    try {
      return await Promise.race([request(), timeout]);
    } catch {
      return { status: 'unavailable' };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  const cache = createRuntimeSnapshotCache(refresh, now);

  return {
    async evaluateFlag(
      key: string,
      {
        workspaceId: workspace,
        userId: user,
        isStaff = false,
      }: Omit<RuntimeReaderContext, 'environment'> = {}
    ): Promise<RuntimeDecision> {
      const flag = catalog.get(key);
      if (flag?.family !== 'runtime' || flag.runtime === undefined) {
        return denyRuntimeFlag('unknown runtime flag');
      }
      if (
        (workspace != null && !isUuid(workspace)) ||
        (user != null && !isUuid(user))
      ) {
        return denyRuntimeFlag('invalid subject ID');
      }
      const { scopes, envFallback } = flag.runtime;
      if (
        (workspace != null && scopes.includes('workspace')) ||
        (user != null && scopes.includes('user'))
      ) {
        return denyRuntimeFlag('subject rules unavailable in the Worker');
      }

      const snapshot = remoteConfig() ? await cache.read() : undefined;
      if (snapshot?.status === 'invalid') {
        return denyRuntimeFlag('malformed platform snapshot');
      }
      if (snapshot?.status !== 'ready' && cache.hadPlatformRule(key)) {
        return denyRuntimeFlag('platform snapshot unavailable');
      }

      return evaluateRuntimeFlag({
        flag,
        context: {
          workspaceId: workspace?.toLowerCase() ?? null,
          userId: user?.toLowerCase() ?? null,
          isStaff,
        },
        rules: snapshot?.status === 'ready' ? snapshot.snapshot.rules : null,
        envValue: envFallback === null ? undefined : env[envFallback],
      });
    },
  };
}

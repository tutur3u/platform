import { withinDeadline } from '../deadline';
import { callMaintenanceRpc, postPrivateRpc } from '../maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from '../types';
import { cloudflareCollector } from './cloudflare';
import { runCollector, type SourceCollector } from './collector';
import { githubCollector, type GithubAuth } from './github';
import {
  githubAppTokenSource,
  hasAnyGithubAppVariable,
  parseGithubAppCredentials,
} from './github-app-auth';

// Cron Control adapters for the observability collectors. Credentials are
// read from the Worker environment by name and passed only to the provider
// request headers.

const ACCOUNT_ID = /^[0-9a-f]{32}$/;

function run(
  context: ProcessorContext,
  collector: SourceCollector,
  configured: boolean
) {
  return runCollector({
    call: (rpc, body, maxBytes) => postPrivateRpc(context, rpc, body, maxBytes),
    collector,
    configured,
    fence: () => withinDeadline(context, context.fence),
    now: context.now,
  });
}

export function collectCloudflareObservability(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const token = context.env.CLOUDFLARE_ANALYTICS_API_TOKEN?.trim() ?? '';
  const accountId = context.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '';
  return run(
    context,
    cloudflareCollector({ ...context, accountId, token }),
    token.length >= 20 && ACCOUNT_ID.test(accountId)
  );
}

/**
 * The GitHub App when all three app variables are valid; the read-only token
 * only when no app variable is set at all. A partial or malformed app
 * configuration is unconfigured, so it never silently falls back.
 */
export function resolveGithubAuth(
  env: ProcessorContext['env']
): GithubAuth | null {
  const app = parseGithubAppCredentials(env);
  if (app) return { kind: 'app', source: githubAppTokenSource(app) };
  if (hasAnyGithubAppVariable(env)) return null;
  const token = env.GITHUB_ACTIONS_READ_TOKEN?.trim() ?? '';
  return token.length >= 20 ? { kind: 'token', token } : null;
}

export function collectGithubObservability(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const auth = resolveGithubAuth(context.env);
  return run(
    context,
    githubCollector({
      ...context,
      auth: auth ?? { kind: 'token', token: '' },
    }),
    auth !== null
  );
}

export function rollupProductAnalytics(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return callMaintenanceRpc(context, 'rollup_product_analytics_daily', [
    'days',
    'rows',
  ]);
}

export function pruneObservability(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return callMaintenanceRpc(context, 'prune_observability_rollups', [
    'rollups',
    'markers',
    'runs',
    'analytics',
  ]);
}

export function evaluateObservabilitySlos(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return callMaintenanceRpc(context, 'evaluate_observability_slos', [
    'evaluated',
    'firing',
    'notified',
  ]);
}

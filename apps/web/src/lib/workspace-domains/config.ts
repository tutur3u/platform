import { normalizePlatformApex } from '@tuturuuu/utils/workspace-domain-hostnames';

/**
 * Deployment configuration for workspace domains. Production values live in
 * the workspace domains runbook; both stay environment values so the SaaS
 * zone can move without a code change.
 */
export interface WorkspaceDomainsConfig {
  /** `<label>.<apex>` platform subdomains; null disables them. */
  platformApex: string | null;
  /** CNAME/ALIAS target for custom hostnames; null disables custom domains. */
  fallbackOrigin: string | null;
}

export function workspaceDomainsConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): WorkspaceDomainsConfig {
  return {
    platformApex: normalizePlatformApex(env.WORKSPACE_DOMAINS_PLATFORM_APEX),
    fallbackOrigin: normalizePlatformApex(
      env.WORKSPACE_DOMAINS_FALLBACK_ORIGIN
    ),
  };
}

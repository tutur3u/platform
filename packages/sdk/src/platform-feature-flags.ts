import {
  createInternalApiClient,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';

export type FeatureFlagEnvironment = 'development' | 'production';
export type FeatureFlagScope = 'platform' | 'workspace' | 'user';
export type FeatureFlagMode = 'on' | 'off' | 'staff' | 'rollout';

/** A stored rule; `mode` is null for an unset rule that keeps its revision. */
export interface FeatureFlagRuleBody {
  mode: FeatureFlagMode | null;
  percentage?: number | null;
  allowWorkspaceIds?: string[] | null;
  allowUserIds?: string[] | null;
}

export interface FeatureFlagRule {
  flagKey: string;
  scope: FeatureFlagScope;
  subjectId: string | null;
  environment: FeatureFlagEnvironment;
  rule: FeatureFlagRuleBody;
  revision: number;
  updatedAt: string | null;
}

export interface FeatureFlagRuleCursor {
  flagKey: string;
  scope: FeatureFlagScope;
  subjectId: string | null;
}

export interface FeatureFlagRulePage {
  rules: FeatureFlagRule[];
  nextCursor: FeatureFlagRuleCursor | null;
}

export interface FeatureFlagAuditRow {
  id: string;
  operationId: string;
  actorId: string | null;
  flagKey: string;
  scope: FeatureFlagScope;
  subjectId: string | null;
  environment: FeatureFlagEnvironment;
  oldRule: FeatureFlagRuleBody | null;
  newRule: FeatureFlagRuleBody | null;
  oldRevision: number;
  newRevision: number;
  reason: string;
  client: string;
  occurredAt: string;
}

export interface FeatureFlagWriteInput {
  flagKey: string;
  scope: FeatureFlagScope;
  subjectId: string | null;
  environment: FeatureFlagEnvironment;
  /** Null unsets the rule. */
  mode: FeatureFlagMode | null;
  percentage?: number;
  allowWorkspaceIds?: string[];
  allowUserIds?: string[];
  expectedRevision: number;
  reason: string;
  operationId: string;
}

export interface FeatureFlagWriteResult {
  status: 'applied' | 'replayed' | 'noop';
  flagKey: string;
  scope: FeatureFlagScope;
  subjectId: string | null;
  environment: FeatureFlagEnvironment;
  revision: number | null;
  oldRule: FeatureFlagRuleBody | null;
  newRule: FeatureFlagRuleBody | null;
  operationId: string | null;
}

/**
 * Outcome of an API call. Failures keep the HTTP status and the stable error
 * code so callers can map them to exit codes; a thrown error is only a
 * transport failure.
 */
export type FeatureFlagApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; revision?: number | null };

const BASE = '/api/v1/infrastructure/feature-flags';

/**
 * Platform admin control plane for runtime feature flag rules. The server
 * derives the actor from the session token and enforces every permission.
 */
export class FeatureFlagsAdminClient {
  private api;
  constructor(options: InternalApiClientOptions) {
    this.api = createInternalApiClient(options);
  }

  private async request<T>(
    path: string,
    init: { method?: 'GET' | 'POST'; body?: unknown } = {}
  ): Promise<FeatureFlagApiResult<T>> {
    const response = await this.api.fetch(path, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      ...(init.body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(init.body),
          }),
    });
    const body = (await response.json().catch(() => null)) as
      | (Record<string, unknown> & { error?: unknown; revision?: unknown })
      | null;
    if (response.ok && body)
      return { ok: true, status: response.status, data: body as T };
    return {
      ok: false,
      status: response.status,
      error:
        typeof body?.error === 'string' && body.error
          ? body.error
          : `http_${response.status}`,
      revision: typeof body?.revision === 'number' ? body.revision : null,
    };
  }

  rules(
    options: {
      environment?: FeatureFlagEnvironment;
      flagKey?: string;
      limit?: number;
      after?: FeatureFlagRuleCursor;
    } = {}
  ) {
    const query = new URLSearchParams();
    if (options.environment) query.set('environment', options.environment);
    if (options.flagKey) query.set('flagKey', options.flagKey);
    if (options.limit) query.set('limit', String(options.limit));
    if (options.after) {
      query.set('afterFlagKey', options.after.flagKey);
      query.set('afterScope', options.after.scope);
      if (options.after.subjectId)
        query.set('afterSubjectId', options.after.subjectId);
    }
    const suffix = query.size ? `?${query}` : '';
    return this.request<FeatureFlagRulePage>(`${BASE}/rules${suffix}`);
  }

  setRule(input: FeatureFlagWriteInput) {
    return this.request<FeatureFlagWriteResult>(`${BASE}/rules`, {
      method: 'POST',
      body: input,
    });
  }

  audit(options: { limit?: number; before?: string; beforeId?: string } = {}) {
    const query = new URLSearchParams();
    if (options.limit) query.set('limit', String(options.limit));
    if (options.before) query.set('before', options.before);
    if (options.beforeId) query.set('beforeId', options.beforeId);
    const suffix = query.size ? `?${query}` : '';
    return this.request<{ rows: FeatureFlagAuditRow[] }>(
      `${BASE}/rules/audit${suffix}`
    );
  }
}

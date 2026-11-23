import {
  createInternalApiClient,
  encodePathSegment,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';

export type QaUserTier = 'FREE' | 'PLUS' | 'PRO';
export type QaUserState = 'pending' | 'active' | 'deleting' | 'deleted';

export interface QaUser {
  userId: string;
  email: string;
  runId: string;
  ordinal: number;
  staff: boolean;
  tier: QaUserTier;
  state: QaUserState;
  purpose: string;
  operatorUserId: string;
  expiresAt: string;
  runWorkspaceId: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface CreateQaUsersPayload {
  count: number;
  staff?: boolean;
  tier?: 'free' | 'plus' | 'pro';
  purpose?: string;
  ttlSeconds?: number;
  runId?: string;
  workspace?: boolean;
}

export interface CreatedQaUser {
  userId: string;
  email: string;
  ordinal: number;
  staff: boolean;
  tier: QaUserTier;
  /** Credential returned once. Store it; never print or log it. */
  password: string;
}

export interface CreateQaUsersResult {
  runId: string;
  purpose: string;
  expiresAt: string;
  runWorkspaceId: string | null;
  users: CreatedQaUser[];
  failed: Array<{
    userId: string;
    email: string;
    /** Which step failed: auth_create, onboarding or activate. */
    stage?: string;
    cleanup: string;
  }>;
}

export interface QaSessionCookie {
  name: string;
  value: string;
  domain?: string;
  path: string;
  sameSite: 'Lax' | 'Strict' | 'None';
  secure: boolean;
  httpOnly: boolean;
  maxAge?: number;
}

/** Contains live credentials. Write it to an owner-only file; never print it. */
export interface QaSessionResult {
  userId: string;
  email: string;
  runId: string;
  expiresAt: string;
  origin: string;
  cookies: QaSessionCookie[];
  session: { accessToken: string; refreshToken: string; expiresAt: number };
}

export type QaDeleteOutcome = 'deleted' | 'not_found' | 'busy' | 'pending';

export interface QaCleanupResult {
  fenced: boolean;
  deleted: string[];
  pending: string[];
  skipped: string[];
}

const BASE = '/api/v1/admin/qa/test-users';
const jsonInit = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  cache: 'no-store' as const,
});

/** QA test-user control plane. The server enforces the QA operator permission. */
export class QaUsersAdminClient {
  private api;
  constructor(options: InternalApiClientOptions) {
    this.api = createInternalApiClient(options);
  }

  list(options: { runId?: string; includeDeleted?: boolean } = {}) {
    const query = new URLSearchParams();
    if (options.runId) query.set('run', options.runId);
    if (options.includeDeleted) query.set('includeDeleted', '1');
    const search = query.toString();
    const suffix = search ? `?${search}` : '';
    return this.api.json<{ users: QaUser[] }>(`${BASE}${suffix}`, {
      cache: 'no-store',
    });
  }

  /**
   * The server answers 503 with the run and per-account failures when every
   * account fails. That body is returned (not thrown) so the caller can show
   * the run ID, failed step and rollback state instead of a bare status.
   */
  async create(payload: CreateQaUsersPayload): Promise<CreateQaUsersResult> {
    const response = await this.api.fetch(BASE, jsonInit('POST', payload));
    const body = (await response.json().catch(() => null)) as
      | (Partial<CreateQaUsersResult> & { error?: string })
      | null;
    if (
      (response.status === 201 || response.status === 503) &&
      body &&
      typeof body.runId === 'string' &&
      Array.isArray(body.users) &&
      Array.isArray(body.failed)
    )
      return body as CreateQaUsersResult;
    throw new Error(
      typeof body?.error === 'string' && body.error
        ? `${body.error} (HTTP ${response.status}).`
        : `QA user create failed (HTTP ${response.status}).`
    );
  }

  /** Not-found, busy and pending are outcomes, not errors. */
  async delete(
    userId: string
  ): Promise<{ userId: string; outcome: QaDeleteOutcome }> {
    const response = await this.api.fetch(
      `${BASE}/${encodePathSegment(userId)}`,
      { method: 'DELETE', cache: 'no-store' }
    );
    if ([200, 202, 404, 409].includes(response.status)) {
      const body = (await response.json().catch(() => null)) as {
        outcome?: QaDeleteOutcome;
      } | null;
      if (body?.outcome) return { userId, outcome: body.outcome };
    }
    throw new Error(`QA user delete failed (HTTP ${response.status}).`);
  }

  session(userId: string, options: { origin?: string } = {}) {
    return this.api.json<QaSessionResult>(
      `${BASE}/${encodePathSegment(userId)}/session`,
      jsonInit('POST', options.origin ? { origin: options.origin } : {})
    );
  }

  cleanup(target: { runId: string } | { expired: true }) {
    return this.api.json<QaCleanupResult>(
      `${BASE}/cleanup`,
      jsonInit('POST', target)
    );
  }
}

export class QaClient {
  readonly users: QaUsersAdminClient;
  constructor(options: InternalApiClientOptions) {
    this.users = new QaUsersAdminClient(options);
  }
}

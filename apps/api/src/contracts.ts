import type { z } from 'zod';
import type { AuthorizationEvidence } from './authorization';
import type { ErrorEncoding } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Principal =
  | { kind: 'public' }
  | {
      kind: 'user';
      userId: string;
      authentication: 'cookie' | 'bearer';
      mfaVerified: boolean;
    }
  | {
      kind: 'api-key';
      keyId: string;
      workspaceId: string;
      permissions: readonly string[];
    }
  | {
      kind: 'external-app';
      appId: string;
      workspaceId: string;
      permissions: readonly string[];
    }
  | { kind: 'service'; serviceId: string }
  | { kind: 'capability'; subject: string; scope: string };

export type RoutePolicy =
  | { kind: 'deny' }
  | { kind: 'public' }
  | { kind: 'user'; requireMfa: boolean }
  | {
      kind: 'workspace';
      workspaceParam: string;
      permission: string;
      object?: { param: string; resource: string };
    }
  | {
      kind: 'api-key';
      workspaceParam: string;
      permission: string;
      object?: { param: string; resource: string };
    }
  | { kind: 'external-app'; workspaceParam: string; permission: string }
  | { kind: 'service'; audience: string }
  | { kind: 'capability'; scope: string }
  | { kind: 'admin'; permission: string };

export interface RouteLimits {
  bodyBytes: number;
  deadlineMs: number;
  ratePolicy: string;
}

export interface ApiEnv {
  RETAINED_API_ORIGIN?: string;
  TRUSTED_PROXY_ORIGIN_SECRET?: string;
  API_WORKER_OPERATIONS?: string;
  ALLOWED_ORIGINS?: string;
  MOBILE_VERSION_POLICY?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface RequestContext {
  request: Request;
  requestId: string;
  params: Readonly<Record<string, string>>;
  principal: Principal;
  signal: AbortSignal;
  env: ApiEnv;
  execution: ExecutionContext;
}

export interface RouteDefinition<Input, Output> {
  operationId: string;
  method: HttpMethod;
  path: string;
  aliases: readonly { path: string; errorEncoding: ErrorEncoding }[];
  policy: RoutePolicy;
  guard: 'metadata' | 'web-api';
  limits: RouteLimits;
  input: z.ZodType<Input>;
  output: z.ZodType<Output>;
  body: 'none' | 'json';
  status: number;
  handle(input: Input, context: RequestContext): Promise<Output> | Output;
}

export interface Endpoint {
  operationId: string;
  method: HttpMethod;
  path: string;
  aliases: RouteDefinition<unknown, unknown>['aliases'];
  policy: RoutePolicy;
  guard: 'metadata' | 'web-api';
  limits: RouteLimits;
  input: z.ZodType;
  output: z.ZodType;
  body: 'none' | 'json';
  status: number;
  runtime: 'worker';
  execute(input: unknown, context: RequestContext): Promise<Response>;
}

export interface SecurityAdapter {
  /** Preserve malformed-cookie, suspicious/abuse, cost, payload and ban guards. */
  guard(
    request: Request,
    endpoint: Endpoint,
    signal: AbortSignal
  ): Promise<void>;
  resolvePrincipal(
    request: Request,
    policy: RoutePolicy,
    signal: AbortSignal
  ): Promise<Principal>;
  /** Must enforce membership, permission, guest policy and resource workspace binding. */
  authorize(
    principal: Principal,
    policy: RoutePolicy,
    params: Readonly<Record<string, string>>,
    signal: AbortSignal
  ): Promise<AuthorizationEvidence>;
}

export interface RequestMetric {
  requestId: string;
  operationId: string;
  status: number;
  durationMs: number;
  runtime: 'worker' | 'retained-next';
}

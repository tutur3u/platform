import { SnapshotCache, versionsLower } from './cache';
import {
  DENY_ALL,
  makeScopePredicate,
  type PredicateNode,
  type ScopePredicate,
} from './scope';
import type {
  Action,
  AuthzPrincipal,
  Decision,
  DenyReason,
  PermissionSnapshot,
  PermissionSource,
  Policy,
  Resource,
  Rule,
} from './types';

export type EngineOptions = {
  policies: readonly Policy[];
  source: PermissionSource;
  /** Every permission id a rule may name; any other id denies. */
  knownPermissions: ReadonlySet<string>;
  /** Milliseconds since the epoch. */
  now?: () => number;
  cacheTtlMs?: number;
};

export type ScopeResult =
  | { allow: true; predicate: ScopePredicate }
  | { allow: false; reason: DenyReason; as: 'not_found' | 'forbidden' };

export interface Engine {
  /** Single-row decision, evaluated against both row images. */
  check(
    principal: AuthzPrincipal,
    action: Action,
    resource: Resource
  ): Promise<Decision>;
  /** The mandatory row predicate for listing `type` inside one workspace. */
  scope(
    principal: AuthzPrincipal,
    action: Action,
    type: string,
    wsId: string
  ): Promise<ScopeResult>;
}

const deny = (
  reason: DenyReason,
  as: 'not_found' | 'forbidden' = 'forbidden'
) => ({ allow: false as const, reason, as });

type Gate =
  | { ok: true; rule: Rule; snapshot: PermissionSnapshot }
  | { ok: false; decision: ReturnType<typeof deny> };

export function createEngine(options: EngineOptions): Engine {
  const now = options.now ?? Date.now;
  const cache = new SnapshotCache(options.cacheTtlMs ?? 60_000, now);
  const policies = new Map<string, Policy>();
  for (const policy of options.policies) {
    if (policies.has(policy.type)) {
      throw new Error(`Duplicate policy for type ${policy.type}.`);
    }
    policies.set(policy.type, policy);
  }

  async function snapshotFor(
    principal: AuthzPrincipal,
    wsId: string
  ): Promise<PermissionSnapshot | DenyReason> {
    const key = { kind: 'user', id: principal.userId } as const;
    let read;
    try {
      read = await options.source.versions(key, wsId);
    } catch {
      return 'source_error';
    }
    if (!read.ok) {
      return read.reason === 'deleted' ? 'version_deleted' : 'version_missing';
    }
    const cached = cache.get(key, wsId, read.versions);
    if (cached) return cached;
    let resolved;
    try {
      resolved = await options.source.resolve(key, wsId);
    } catch {
      return 'source_error';
    }
    if (!resolved.ok) {
      return resolved.reason === 'deleted'
        ? 'version_deleted'
        : 'version_missing';
    }
    // A resolve older than this request's own version read is never used.
    if (versionsLower(resolved.versions, read.versions)) return 'stale_resolve';
    if (resolved.snapshot.wsId !== wsId) return 'snapshot_mismatch';
    cache.set(key, wsId, resolved.versions, resolved.snapshot);
    return resolved.snapshot;
  }

  /** Every check that precedes rule evaluation, in deny-first order. */
  async function gate(
    principal: AuthzPrincipal,
    action: Action,
    type: string,
    wsId: string
  ): Promise<Gate> {
    if (principal.kind !== 'user' || !principal.userId) {
      return { ok: false, decision: deny('no_policy') };
    }
    if (!(principal.expiresAt * 1000 > now())) {
      return { ok: false, decision: deny('expired') };
    }
    if (!wsId)
      return { ok: false, decision: deny('foreign_workspace', 'not_found') };
    const policy = policies.get(type);
    // Own properties only, so `constructor` or `__proto__` never name a rule.
    const rule =
      policy && Object.hasOwn(policy.actions, action)
        ? policy.actions[action]
        : undefined;
    if (!policy || !rule) return { ok: false, decision: deny('no_policy') };

    const credential = principal.credential;
    if (credential.kind === 'access') {
      if (!credential.allowedWsIds.includes(wsId)) {
        return {
          ok: false,
          decision: deny('outside_token_workspaces', 'not_found'),
        };
      }
      const needed =
        policy.scopes && Object.hasOwn(policy.scopes, action)
          ? policy.scopes[action]
          : undefined;
      if (!needed) return { ok: false, decision: deny('no_scope_mapping') };
      if (!credential.scopes.includes(needed)) {
        return { ok: false, decision: deny('missing_scope') };
      }
    } else if (credential.kind !== 'identity') {
      return { ok: false, decision: deny('no_policy') };
    }

    const snapshot = await snapshotFor(principal, wsId);
    if (typeof snapshot === 'string') {
      return {
        ok: false,
        decision: deny(
          snapshot,
          snapshot === 'snapshot_mismatch' ? 'not_found' : 'forbidden'
        ),
      };
    }
    if (!snapshot.member) {
      return { ok: false, decision: deny('not_member', 'not_found') };
    }
    return { ok: true, rule, snapshot };
  }

  function evaluate(
    rule: Rule,
    principal: AuthzPrincipal,
    snapshot: PermissionSnapshot,
    row: Readonly<Record<string, unknown>> | undefined
  ): boolean | DenyReason {
    switch (rule.kind) {
      case 'member':
        return snapshot.member;
      case 'permission':
        if (!options.knownPermissions.has(rule.permission)) {
          return 'unknown_permission';
        }
        return snapshot.permissions.has(rule.permission);
      case 'owner':
        return row !== undefined && row[rule.column] === principal.userId;
      case 'aal2':
        return (
          principal.credential.kind === 'identity' &&
          principal.credential.aal === 'aal2'
        );
      case 'all':
      case 'any': {
        if (rule.rules.length === 0) return false;
        for (const child of rule.rules) {
          const result = evaluate(child, principal, snapshot, row);
          if (typeof result === 'string') return result;
          if (rule.kind === 'all' && !result) return false;
          if (rule.kind === 'any' && result) return true;
        }
        return rule.kind === 'all';
      }
      default:
        return 'evaluation_error';
    }
  }

  function toPredicate(
    rule: Rule,
    principal: AuthzPrincipal,
    snapshot: PermissionSnapshot
  ): PredicateNode | DenyReason {
    switch (rule.kind) {
      case 'owner':
        return { op: 'eq', column: rule.column, value: principal.userId };
      case 'all':
      case 'any': {
        if (rule.rules.length === 0) return { op: 'false' };
        const items: PredicateNode[] = [];
        for (const child of rule.rules) {
          const node = toPredicate(child, principal, snapshot);
          if (typeof node === 'string') return node;
          items.push(node);
        }
        return { op: rule.kind === 'all' ? 'and' : 'or', items };
      }
      default: {
        // Row-independent rules become a constant.
        const result = evaluate(rule, principal, snapshot, undefined);
        if (typeof result === 'string') return result;
        return { op: result ? 'true' : 'false' };
      }
    }
  }

  return {
    async check(principal, action, resource) {
      try {
        for (const image of [resource.before, resource.after]) {
          if (image && 'ws_id' in image && image.ws_id !== resource.wsId) {
            return deny('foreign_workspace', 'not_found');
          }
        }
        const gated = await gate(
          principal,
          action,
          resource.type,
          resource.wsId
        );
        if (!gated.ok) return gated.decision;
        const images = [resource.before, resource.after].filter(
          (image) => image !== undefined
        );
        for (const image of images.length > 0 ? images : [undefined]) {
          const result = evaluate(gated.rule, principal, gated.snapshot, image);
          if (typeof result === 'string') return deny(result);
          if (!result) return deny('rule', 'not_found');
        }
        return { allow: true };
      } catch {
        return deny('evaluation_error');
      }
    },

    async scope(principal, action, type, wsId) {
      try {
        const gated = await gate(principal, action, type, wsId);
        if (!gated.ok) return gated.decision;
        const node = toPredicate(gated.rule, principal, gated.snapshot);
        if (typeof node === 'string') return deny(node);
        return {
          allow: true,
          predicate: node.op === 'false' ? DENY_ALL : makeScopePredicate(node),
        };
      } catch {
        return deny('evaluation_error');
      }
    },
  };
}

import { NextResponse } from 'next/server';

export const WORKSPACE_CREATOR_PROTECTED = 'WORKSPACE_CREATOR_PROTECTED';
export const WORKSPACE_LAST_MANAGER = 'WORKSPACE_LAST_MANAGER';
// A workspace with full members must retain a member manager even on self-removal.
export const GUARD_WORKSPACE_SELF_REMOVAL = true;

/**
 * Answers of `remove_workspace_member_guarded` and
 * `remove_workspace_role_member_guarded`. Only the member function answers
 * `creator_protected`.
 */
const GUARDED_REMOVAL_RESULTS = [
  'creator_protected',
  'forbidden',
  'last_manager',
  'not_found',
  'removed',
] as const;

export type GuardedRemovalResult = (typeof GUARDED_REMOVAL_RESULTS)[number];

export function parseGuardedRemovalResult(
  value: unknown
): GuardedRemovalResult | null {
  return GUARDED_REMOVAL_RESULTS.find((result) => result === value) ?? null;
}

export function creatorProtectedResponse() {
  return NextResponse.json(
    {
      code: WORKSPACE_CREATOR_PROTECTED,
      message: 'The workspace creator cannot be removed',
    },
    { status: 403 }
  );
}

export function lastManagerResponse() {
  return NextResponse.json(
    {
      code: WORKSPACE_LAST_MANAGER,
      message: 'At least one member must be able to manage members',
    },
    { status: 409 }
  );
}

/**
 * Maps a guarded removal function's answer to the refusal the route sends.
 * Returns `null` when the route continues: the person was removed, or there
 * was nothing to remove (`not_found`). An RPC error, an unknown answer, or an
 * answer the called function never gives is logged and answered with
 * `failureResponse`.
 */
export function guardedRemovalRefusal({
  error,
  failureResponse,
  kind,
  result,
  wsId,
}: {
  error: unknown;
  failureResponse: () => NextResponse;
  kind: 'member' | 'role-member';
  result: unknown;
  wsId: string;
}): NextResponse | null {
  const parsed = error ? null : parseGuardedRemovalResult(result);

  switch (parsed) {
    case 'removed':
    case 'not_found':
      return null;
    case 'forbidden':
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    case 'last_manager':
      return lastManagerResponse();
    case 'creator_protected':
      if (kind === 'member') return creatorProtectedResponse();
      break;
    case null:
      break;
  }

  console.error('Guarded CMS team removal failed', {
    error,
    kind,
    result: typeof result === 'string' ? result : typeof result,
    wsId,
  });
  return failureResponse();
}

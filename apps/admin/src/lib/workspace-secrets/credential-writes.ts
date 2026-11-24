import type { WorkspaceSecretPutResult } from '@tuturuuu/utils/workspace-secrets/protocol';
import { NextResponse } from 'next/server';

/**
 * BYOK provider keys are written only by their own handlers; every generic
 * Secrets route refuses them, for every caller.
 */
export function isReservedProviderKeyName(name: string | null | undefined) {
  return /^AI_PROVIDER_KEY:/iu.test(name?.trim() ?? '');
}

export function reservedProviderKeyResponse() {
  return NextResponse.json(
    { message: 'AI provider keys are managed in AI provider keys.' },
    { status: 403 }
  );
}

/** The response for a credential written through the workspace secrets Worker. */
export function credentialWriteResponse(result: WorkspaceSecretPutResult) {
  switch (result.status) {
    case 'ok':
      return NextResponse.json({ message: 'success' });
    case 'conflict':
      return NextResponse.json(
        { message: 'Workspace secret changed; reload and try again.' },
        { status: 409 }
      );
    case 'not_found':
      return NextResponse.json(
        { message: 'Workspace secret not found' },
        { status: 404 }
      );
    case 'invalid':
    case 'not_credential':
      return NextResponse.json(
        { message: 'Invalid workspace secret payload' },
        { status: 400 }
      );
    case 'forbidden':
      return NextResponse.json(
        { message: 'Permission denied' },
        { status: 403 }
      );
    default:
      // The Worker's own logs carry the failure class; no value is logged.
      console.error(
        'Workspace secrets Worker unavailable for a credential write'
      );
      return NextResponse.json(
        { message: 'Workspace secrets are unavailable; try again.' },
        { status: 503 }
      );
  }
}

export function crossTierChangeResponse() {
  return NextResponse.json(
    {
      message:
        'This secret cannot move between credential and configuration names. Delete it and create a new one.',
    },
    { status: 400 }
  );
}

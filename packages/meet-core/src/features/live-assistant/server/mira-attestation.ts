import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { miraAttestationFromRow } from '../demo-admission';
import type { MiraWorkspaceAttestation } from '../participant-consent';

/** Authoritative 18+ audience attestation, read with the service role. */
export async function readMiraAdultAttestation(
  workspaceId: string
): Promise<MiraWorkspaceAttestation | null> {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .schema('private')
    .from('workspace_mira_audience_attestations')
    .select('ws_id, audience, attested_by, attested_at')
    .eq('ws_id', workspaceId)
    .maybeSingle();
  if (error) throw new Error('Mira attestation lookup failed');
  return miraAttestationFromRow(data, workspaceId);
}

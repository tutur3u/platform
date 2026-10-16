import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { resolveJournalWorkspaceId } from '@/lib/personal-journal/auth';
import JournalClient from './client';
export default async function PersonalJournalPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const supabase = await createClient();
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
  if (authError || !user) notFound();
  const wsId = await resolveJournalWorkspaceId((await params).wsId, supabase);
  if (!wsId) notFound();
  const membership = await verifyWorkspaceMembershipType({
    supabase,
    wsId,
    userId: user.id,
    requiredType: 'MEMBER',
  });
  if (membership.error === 'membership_lookup_failed')
    throw new Error('Journal access unavailable');
  if (!membership.ok) notFound();
  const { data, error } = await supabase
    .from('workspaces')
    .select('personal,creator_id,deleted')
    .eq('id', wsId)
    .maybeSingle();
  if (error) throw new Error('Journal access unavailable');
  if (!data?.personal || data.deleted || data.creator_id !== user.id)
    notFound();
  return (
    <JournalClient key={`${user.id}:${wsId}`} actorId={user.id} wsId={wsId} />
  );
}

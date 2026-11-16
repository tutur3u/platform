import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions, verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';
import { parsePeopleSearch, peopleSearchPattern, projectWorkspacePeople, type PersonCandidate } from '@/lib/workspace-people';

const noStore = { 'Cache-Control': 'private, no-store' };

export const GET = withSessionAuth<{ wsId: string }>(async (request, { user, supabase }, params) => {
  await connection();
  const search = parsePeopleSearch(request.nextUrl.searchParams);
  if (!search) {
    return NextResponse.json({ error: 'Invalid people search' }, { status: 400, headers: noStore });
  }
  const { query, limit } = search;
  try {
    const wsId = await normalizeWorkspaceId(params.wsId, supabase, request);
    const membership = await verifyWorkspaceMembershipType({ wsId, userId: user.id, supabase, requiredType: 'MEMBER' });
    if (!membership.ok) return NextResponse.json({ error: 'Workspace not found' }, { status: 404, headers: noStore });
    const permissions = await getPermissions({ wsId, user, request });
    if (!permissions) return NextResponse.json({ error: 'Workspace not found' }, { status: 404, headers: noStore });
    const publicContacts = permissions.containsPermission('view_users_public_info');
    const privateContacts = permissions.containsPermission('view_users_private_info');
    if (!publicContacts && !privateContacts) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore });

    const admin = await createAdminClient({ noCookie: true });
    const policy = await admin.from('workspace_secrets').select('name')
      .eq('ws_id', wsId).in('name', ['HIDE_MEMBER_NAME', 'HIDE_MEMBER_EMAIL']).eq('value', 'true');
    if (policy.error) throw policy.error;
    const hideName = policy.data.some(({ name }) => name === 'HIDE_MEMBER_NAME');
    const hideEmail = policy.data.some(({ name }) => name === 'HIDE_MEMBER_EMAIL');
    const pattern = peopleSearchPattern(query);
    const contactFilters = [
      ...(!hideName && publicContacts ? [`display_name.ilike.${pattern}`] : []),
      ...(!hideName && publicContacts ? [`full_name.ilike.${pattern}`] : []),
      ...(!hideEmail && privateContacts ? [`email.ilike.${pattern}`] : []),
    ];
    const memberFilters = [
      ...(!hideName ? [`display_name.ilike.${pattern}`] : []),
      ...(!hideEmail ? [`email.ilike.${pattern}`] : []),
    ];
    const candidates: PersonCandidate[] = [];
    if (memberFilters.length) {
      const members = await supabase.from('workspace_members_and_invites')
        .select('id, display_name, email, avatar_url').eq('ws_id', wsId).eq('pending', false)
        .or(memberFilters.join(',')).order('id').limit(limit);
      if (members.error) throw members.error;
      for (const member of members.data) {
        if (member.id) candidates.push({ ...member, id: member.id, kind: 'member' });
      }
    }
    if (contactFilters.length) {
      const contacts = await supabase.from('workspace_users')
        .select('id, display_name, full_name, email, avatar_url').eq('ws_id', wsId).eq('archived', false)
        .or(contactFilters.join(',')).order('id').limit(limit);
      if (contacts.error) throw contacts.error;
      candidates.push(...contacts.data.map((contact) => ({ ...contact, kind: 'contact' as const })));
    }
    return NextResponse.json({ data: projectWorkspacePeople(candidates, { hideName, hideEmail, publicContacts, privateContacts }, query, limit) }, {
      headers: noStore,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to search people' }, { status: 500, headers: noStore });
  }
}, { allowAppSessionAuth: { targetApp: ['mail', 'calendar', 'tasks', 'meet', 'contacts'] } });

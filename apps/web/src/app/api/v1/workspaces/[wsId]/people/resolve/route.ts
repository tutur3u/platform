import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';
import type { PersonCandidate } from '@/lib/workspace-people';
import {
  exactEmailPattern,
  isMissingColumnError,
  parsePeopleResolve,
  projectResolvedPeople,
} from '@/lib/workspace-people-resolve';

const noStore = { 'Cache-Control': 'private, no-store' };

/**
 * Resolves the addresses a Mail view already shows to same-workspace people.
 * Exact address matches only, under the people-search permission and
 * visibility rules; unmatched or hidden addresses come back as `unknown`.
 */
export const POST = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, params) => {
    await connection();
    const emails = parsePeopleResolve(await request.json().catch(() => null));
    if (!emails) {
      return NextResponse.json(
        { error: 'Invalid people lookup' },
        { status: 400, headers: noStore }
      );
    }
    try {
      const wsId = await normalizeWorkspaceId(params.wsId, supabase, request);
      const membership = await verifyWorkspaceMembershipType({
        wsId,
        userId: user.id,
        supabase,
        requiredType: 'MEMBER',
      });
      if (!membership.ok)
        return NextResponse.json(
          { error: 'Workspace not found' },
          { status: 404, headers: noStore }
        );
      const permissions = await getPermissions({ wsId, user, request });
      if (!permissions)
        return NextResponse.json(
          { error: 'Workspace not found' },
          { status: 404, headers: noStore }
        );
      const publicContacts = permissions.containsPermission(
        'view_users_public_info'
      );
      const privateContacts = permissions.containsPermission(
        'view_users_private_info'
      );
      if (!publicContacts && !privateContacts)
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403, headers: noStore }
        );

      const admin = await createAdminClient({ noCookie: true });
      const policy = await admin
        .from('workspace_secrets')
        .select('name')
        .eq('ws_id', wsId)
        .in('name', ['HIDE_MEMBER_NAME', 'HIDE_MEMBER_EMAIL'])
        .eq('value', 'true');
      if (policy.error) throw policy.error;
      const visibility = {
        hideName: policy.data.some(({ name }) => name === 'HIDE_MEMBER_NAME'),
        hideEmail: policy.data.some(({ name }) => name === 'HIDE_MEMBER_EMAIL'),
        publicContacts,
        privateContacts,
      };
      const emailFilter = emails
        .map((email) => `email.ilike.${exactEmailPattern(email)}`)
        .join(',');

      const candidates: (PersonCandidate & { mail_blocked?: boolean })[] = [];
      if (!visibility.hideEmail) {
        const members = await supabase
          .from('workspace_members_and_invites')
          .select('id, display_name, email, avatar_url')
          .eq('ws_id', wsId)
          .eq('pending', false)
          .or(emailFilter)
          .limit(500);
        if (members.error) throw members.error;
        for (const member of members.data) {
          if (member.id)
            candidates.push({ ...member, id: member.id, kind: 'member' });
        }
      }
      if (privateContacts && !visibility.hideEmail) {
        const selectContacts = (columns: string) =>
          supabase
            .from('workspace_users')
            .select(columns)
            .eq('ws_id', wsId)
            .eq('archived', false)
            .or(emailFilter)
            .order('created_at')
            .limit(500);
        const baseColumns = 'id, display_name, full_name, email, avatar_url';
        let contacts = await selectContacts(`${baseColumns}, mail_blocked`);
        // mail_blocked arrives with a Mail migration; until it is applied,
        // contacts resolve without the blocked flag instead of failing.
        if (contacts.error && isMissingColumnError(contacts.error))
          contacts = await selectContacts(baseColumns);
        if (contacts.error) throw contacts.error;
        const contactRows = (contacts.data ?? []) as unknown as (Omit<
          PersonCandidate,
          'kind'
        > & { mail_blocked?: boolean })[];
        candidates.push(
          ...contactRows.map((contact) => ({
            ...contact,
            kind: 'contact' as const,
          }))
        );
      }

      return NextResponse.json(
        { data: projectResolvedPeople(emails, candidates, visibility) },
        { headers: noStore }
      );
    } catch {
      return NextResponse.json(
        { error: 'Unable to resolve people' },
        { status: 500, headers: noStore }
      );
    }
  },
  {
    allowAppSessionAuth: { targetApp: ['mail'] },
    maxPayloadSize: 20_000,
    rateLimit: { windowMs: 60_000, maxRequests: 60 },
  }
);

import { ArrowLeft } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  requireNovaAppSessionUser,
  requireNovaEnabledRole,
} from '@/lib/app-session';
import TeamDetailsClient from './client-page';

interface Props {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

export default async function TeamDetailsPage({ params }: Props) {
  const t = await getTranslations();
  const { id } = await params;

  const teamData = await getTeamData(id);
  const membersData = await getTeamMembersData(id);
  const invitationsData = await getTeamInvitationsData(id);
  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href="/teams">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-bold text-2xl tracking-tight">
            {t('teams.plural')}
          </h1>
        </div>
      </div>
      <Separator className="my-4" />
      <TeamDetailsClient
        teamId={id}
        teamData={teamData}
        initialMembers={membersData}
        initialInvitations={invitationsData}
      />
    </div>
  );
}

async function getTeamData(id: string) {
  const sbAdmin = await createAdminClient({ noCookie: true });

  const { data, error } = await sbAdmin
    .from('nova_teams')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching team:', error);
    return null;
  }

  if (!data) notFound();

  return data;
}

async function getTeamMembersData(id: string) {
  const user = await requireNovaAppSessionUser();
  const roleData = await requireNovaEnabledRole(user);

  if (!roleData?.allow_role_management) notFound();

  const sbAdmin = await createAdminClient({ noCookie: true });

  const { data, error } = await sbAdmin
    .from('nova_team_members')
    .select(
      `
      team_id,
      id:user_id,
      created_at,
      ...users(id, display_name, ...user_private_details(email))
    `
    )
    .eq('team_id', id);

  if (error) {
    console.error('Error fetching team members:', error);
    return [];
  }

  return data;
}

async function getTeamInvitationsData(id: string) {
  const sbAdmin = await createAdminClient({ noCookie: true });

  const { data, error } = await sbAdmin
    .from('nova_team_emails')
    .select('*')
    .eq('team_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching team invitations:', error);
    return [];
  }

  return data;
}

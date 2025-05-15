import TeamDetailsClient from './client-page';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { ArrowLeft } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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
          <h1 className="text-2xl font-bold tracking-tight">
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
  const supabase = await createClient();

  const { data, error } = await supabase
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) notFound();

  const { data: roleData, error: roleError } = await supabase
    .from('platform_email_roles')
    .select('allow_role_management')
    .eq('email', user.email)
    .maybeSingle();

  if (roleError) {
    console.error('Error fetching role:', roleError);
    return [];
  }

  if (!roleData?.allow_role_management) notFound();

  const sbAdmin = await createAdminClient();

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
  const supabase = await createClient();

  const { data, error } = await supabase
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

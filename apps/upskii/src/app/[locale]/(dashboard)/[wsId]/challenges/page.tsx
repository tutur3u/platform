import ChallengesList from './ChallengesList';
import { fetchChallenges } from './actions';
import CreateChallengeDialog from './createChallengeDialog';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Plus } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

export default async function Page({
  params,
}: {
  params: Promise<{
    wsId: string;
  }>;
}) {
  const { wsId } = await params;
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();
  const t = await getTranslations('nova');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect('/login');

  const { data: whitelisted } = await sbAdmin
    .from('nova_roles')
    .select(
      'enabled, allow_challenge_management, allow_manage_all_challenges,allow_role_management'
    )
    .eq('email', user?.email as string)
    .maybeSingle();

  const isAdmin = Boolean(
    whitelisted?.enabled && whitelisted?.allow_challenge_management
  );

  //only superAdmin can create new challenge
  const canCreateChallenges = Boolean(
    whitelisted?.allow_manage_all_challenges ||
      whitelisted?.allow_role_management
  );

  const challenges = await fetchChallenges();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <h1 className="text-3xl font-bold">
          {t('challenges-page.prompt-engineering-challenges')}
        </h1>
        {canCreateChallenges && (
          <CreateChallengeDialog
            trigger={
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t('challenges-page.create-challenge')}
              </Button>
            }
          />
        )}
      </div>
      <ChallengesList isAdmin={isAdmin} challenges={challenges} wsId={wsId} />
    </div>
  );
}

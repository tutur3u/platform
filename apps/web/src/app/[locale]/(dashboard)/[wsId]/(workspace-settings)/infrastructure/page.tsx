import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Separator } from '@tuturuuu/ui/separator';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import UserRegistrationChart from './_components/user-registration-chart';

export const metadata: Metadata = {
  title: 'Infrastructure',
  description:
    'Manage Infrastructure in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureOverviewPage({ params }: Props) {
  const { wsId } = await params;
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const t = await getTranslations();

  const userRegistrationData = await getUserRegistrationData();

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4">
        <div>
          <h1 className="font-bold text-2xl">
            {t('workspace-settings-layout.infrastructure')}
          </h1>
          <p className="text-foreground/80">
            Monitor and manage your platform infrastructure, users, and
            resources.
          </p>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Analytics Chart */}
      <div className="rounded-lg border border-border bg-foreground/5 p-4">
        <UserRegistrationChart data={userRegistrationData} />
      </div>
    </>
  );
}

async function getUserRegistrationData() {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) notFound();

  const { data } = await supabaseAdmin
    .from('users')
    .select('created_at')
    .order('created_at', { ascending: true });

  return (data
    ?.filter((user) => user.created_at)
    ?.map((user) => ({
      date: user.created_at,
      count: 1,
      created_at: user.created_at,
    })) || []) as { date: string; count: number; created_at: string }[];
}

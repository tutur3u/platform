import { Settings } from '@tuturuuu/icons';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { enforceInfrastructureRootWorkspace } from '../../enforce-infrastructure-root';
import { AiStudioPolicyClient } from './ai-studio-policy-client';
import type { AiStudioGlobalSettings } from './types';

export const metadata: Metadata = {
  description: 'Manage global and workspace AI Studio policy.',
  title: 'AI Studio Policy',
};

interface Props {
  params: Promise<{ wsId: string }>;
}

export default async function InfrastructureAiStudioPage({ params }: Props) {
  await connection();

  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const user = await getSatelliteAppSessionUser('infra');
  if (!user) notFound();

  const permissions = await getPermissions({
    user,
    wsId: ROOT_WORKSPACE_ID,
  });
  if (!permissions?.containsPermission('manage_workspace_roles')) notFound();

  const sbAdmin = await createAdminClient({ noCookie: true });
  const [t, globalResult] = await Promise.all([
    getTranslations('ai-studio-admin'),
    sbAdmin
      .schema('private')
      .from('ai_studio_global_settings')
      .select(
        'globally_enabled,workspace_default_enabled,default_models,capture_default_enabled,metadata_retention_days,content_retention_days'
      )
      .eq('singleton', true)
      .single(),
  ]);

  if (globalResult.error) {
    console.error('Failed to load AI Studio global settings', {
      code: globalResult.error.code,
    });
  }
  const globalRow = globalResult.data;
  const globalSettings: AiStudioGlobalSettings = {
    captureDefaultEnabled: globalRow?.capture_default_enabled ?? false,
    contentRetentionDays: globalRow?.content_retention_days ?? 30,
    defaultModels: globalRow?.default_models ?? [],
    globallyEnabled: globalRow?.globally_enabled ?? false,
    metadataRetentionDays: globalRow?.metadata_retention_days ?? 365,
    workspaceDefaultEnabled: globalRow?.workspace_default_enabled ?? false,
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h1 className="font-bold text-2xl">{t('title')}</h1>
        </div>
        <p className="max-w-3xl text-foreground/80">{t('description')}</p>
      </div>
      <Separator className="my-4" />
      <AiStudioPolicyClient
        globalSettings={globalSettings}
        infrastructureWsId={wsId}
      />
    </>
  );
}

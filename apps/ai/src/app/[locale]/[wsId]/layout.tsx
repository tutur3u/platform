import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { StudioShell } from '@/components/studio-shell';
import { getAiStudioWorkspaceContext } from '@/lib/access';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const context = await getAiStudioWorkspaceContext(wsId);
  if (!context) redirect('/login');

  const t = await getTranslations('ai-studio');
  const labels = Object.fromEntries(
    [
      'overview',
      'playground',
      'prompts',
      'agents',
      'datasets',
      'evaluations',
      'experiments',
      'api-keys',
      'model-policy',
      'runs',
      'logs',
      'usage',
      'credits',
      'studio',
    ].map((key) => [key, t(key)])
  );

  return (
    <StudioShell
      labels={labels}
      workspaceId={wsId}
      workspaceName={context.workspace.name ?? t('studio')}
    >
      {context.enabled ? (
        children
      ) : (
        <div className="grid min-h-[calc(100vh-4rem)] place-items-center p-6">
          <div className="max-w-lg rounded-2xl border bg-background/80 p-8 text-center shadow-xl">
            <h1 className="font-semibold text-2xl">{t('access-disabled')}</h1>
            <p className="mt-2 text-muted-foreground">
              {t('access-disabled-description')}
            </p>
          </div>
        </div>
      )}
    </StudioShell>
  );
}

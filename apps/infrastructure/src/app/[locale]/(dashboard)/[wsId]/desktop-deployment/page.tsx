import { ExternalLink, Monitor, ShieldCheck } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { DESKTOP_PLATFORMS } from '@/lib/desktop-deployment/status';
import { getDesktopDeploymentStatus } from '@/lib/desktop-deployment/status.server';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';

export default async function DesktopDeploymentPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);
  const [t, state] = await Promise.all([
    getTranslations('desktop-deployment'),
    getDesktopDeploymentStatus(),
  ]);
  const setup =
    'https://docs.tuturuuu.com/build/devops/desktop-beta-distribution';
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 font-bold text-2xl">
          <Monitor className="size-5 text-primary" />
          {t('title')}
        </h1>
        <p className="text-muted-foreground">{t('description')}</p>
        <a
          className="inline-flex items-center gap-2 text-primary underline underline-offset-4"
          href={setup}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('setup')}
          <ExternalLink className="size-4" />
        </a>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t('workflow')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.run ? (
            <>
              <a
                className="text-primary underline underline-offset-4"
                href={state.run.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('run', { id: state.run.id })}
              </a>
              <p>{t(`states.${state.run.conclusion ?? state.run.status}`)}</p>
              <code className="block break-all text-xs">
                {state.run.source}
              </code>
              {state.jobsAvailable ? (
                <ul className="divide-y">
                  {state.jobs.map((job) => (
                    <li
                      key={job.name}
                      className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                    >
                      <span>{job.name}</span>
                      <span>{t(`states.${job.conclusion ?? job.status}`)}</span>
                      {job.provenanceVerified && (
                        <p className="w-full text-muted-foreground">
                          {t('provenancePassed')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  {t('metadataUnavailable')}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">{t('metadataUnavailable')}</p>
          )}
          <p className="text-muted-foreground text-sm">{t('workflowScope')}</p>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {DESKTOP_PLATFORMS.map((platform) => {
          const artifact = state.packages.find(
            (item) => item.platform === platform
          );
          return (
            <Card key={platform}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4" />
                  {t(`platforms.${platform}`)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{t(`trust.${platform}`)}</p>
                <p className="rounded-lg bg-muted p-3">
                  {t('configurationUnknown')}
                </p>
                {artifact ? (
                  <>
                    <a
                      className="block text-primary underline underline-offset-4"
                      href={artifact.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('release', { tag: artifact.tag })}
                    </a>
                    <p className="text-muted-foreground">
                      {t('artifactMetadataOnly')}
                    </p>
                    <details>
                      <summary className="cursor-pointer">
                        {t('digest')}
                      </summary>
                      <code className="block break-all pt-2 text-xs">
                        {artifact.digest}
                      </code>
                    </details>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {t(
                      state.releasesAvailable
                        ? 'noArtifact'
                        : 'metadataUnavailable'
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('management')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{t('managementDescription')}</p>
          <div className="flex flex-wrap gap-4">
            {[
              [
                'github',
                'https://github.com/tutur3u/platform/settings/environments',
              ],
              ['microsoft', 'https://portal.azure.com/'],
              [
                'apple',
                'https://developer.apple.com/account/resources/certificates/list',
              ],
              [
                'store',
                'https://partner.microsoft.com/en-us/dashboard/products/9N7B6VC7RR7W/overview',
              ],
              [
                'storeWorkflow',
                'https://github.com/tutur3u/platform/actions/workflows/desktop-store-draft.yaml',
              ],
            ].map(([key, url]) => (
              <a
                key={key}
                href={url}
                className="text-primary underline underline-offset-4"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(`managementLinks.${key}`)}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

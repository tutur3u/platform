import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { getTranslations } from 'next-intl/server';
import { WEB_APP_URL } from '@/constants/common';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

const INFRA_LINKS = [
  {
    key: 'monitoring',
    path: '/monitoring',
  },
  {
    key: 'ai',
    path: '/ai',
  },
  {
    key: 'mobile',
    path: '/mobile-deployment',
  },
  {
    key: 'githubBot',
    path: '/github-bot',
  },
  {
    key: 'externalApps',
    path: '/external-apps',
  },
  {
    key: 'appCoordination',
    path: '/app-coordination',
  },
] as const;

function getWebInfrastructureUrl(wsId: string, path: string) {
  return `${WEB_APP_URL}/${encodeURIComponent(wsId)}/infrastructure${path}`;
}

export default async function Page({ params }: PageProps) {
  const { wsId } = await params;
  const t = await getTranslations('infra');

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Badge variant="secondary">{t('phaseLabel')}</Badge>
        <div className="space-y-2">
          <h1 className="font-semibold text-3xl tracking-normal">
            {t('title')}
          </h1>
          <p className="max-w-3xl text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {INFRA_LINKS.map((item) => (
          <Card className="rounded-md" key={item.key}>
            <CardHeader>
              <CardTitle className="text-base">
                {t(`${item.key}.title`)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="min-h-12 text-muted-foreground text-sm">
                {t(`${item.key}.description`)}
              </p>
              <Button asChild size="sm" variant="outline">
                <a href={getWebInfrastructureUrl(wsId, item.path)}>
                  {t('openInWeb')}
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

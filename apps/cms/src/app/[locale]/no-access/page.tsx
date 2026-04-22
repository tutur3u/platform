import { AlertTriangle } from '@tuturuuu/icons';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { getTranslations } from 'next-intl/server';

export default async function CmsNoAccessPage() {
  const t = await getTranslations();

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-6 py-16">
      <Card className="w-full border-border/70 bg-card/80">
        <CardHeader className="items-center text-center">
          <div className="rounded-full border border-border/70 bg-background/80 p-4 text-muted-foreground">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <CardTitle className="mt-4 text-2xl">
            {t('common.access_denied')}
          </CardTitle>
          <CardDescription className="max-w-xl text-sm leading-6">
            {t('workspace-settings-layout.external_projects_registry')}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground text-sm">
          {t('common.workspaces')}
        </CardContent>
      </Card>
    </div>
  );
}

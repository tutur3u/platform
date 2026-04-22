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
  const tCommon = await getTranslations('common');
  const tRoot = await getTranslations('external-projects.root');

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-6 py-16">
      <Card className="w-full border-border/70 bg-gradient-to-br from-background via-background to-dynamic-orange/5 shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="rounded-full border border-border/70 bg-dynamic-orange/10 p-4 text-dynamic-orange">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <CardTitle className="mt-4 text-2xl">
            {tCommon('access_denied')}
          </CardTitle>
          <CardDescription className="max-w-xl text-sm leading-6">
            {tRoot('title')}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground text-sm">
          {tCommon('workspaces')}
        </CardContent>
      </Card>
    </div>
  );
}

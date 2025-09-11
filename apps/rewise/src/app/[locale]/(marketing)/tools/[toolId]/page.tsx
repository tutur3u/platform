import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ChevronLeft } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { use } from 'react';
import { supportedLocales } from '@/i18n/routing';
import { tools } from '../data';
import { ToolForm } from './tool-form';

export function generateStaticParams() {
  return supportedLocales.flatMap((locale) =>
    tools.map((tool) => ({ locale, toolId: tool.id }))
  );
}

export default function ToolDetailsPage({
  params,
}: {
  params: Promise<{
    locale: string;
    toolId: string;
  }>;
}) {
  const { toolId } = use(params);
  const t = useTranslations();
  const tool = tools.find((tool) => tool.id === toolId);
  if (!tool) notFound();

  return (
    <div className="container mx-auto space-y-4 py-8">
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="flex items-center gap-2"
      >
        <Link href="/tools">
          <ChevronLeft className="h-4 w-4" />
          {t('common.back')}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">{tool.name}</CardTitle>
          <p className="mt-2 text-muted-foreground">{tool.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {tool.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <Separator className="mb-4" />
        <CardContent>
          <ToolForm tool={tool} />
        </CardContent>
      </Card>
    </div>
  );
}

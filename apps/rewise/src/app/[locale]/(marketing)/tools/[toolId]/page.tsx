import { tools } from '../data';
import { ToolForm } from './tool-form';
import { supportedLocales } from '@/i18n/routing';
import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { Separator } from '@repo/ui/components/ui/separator';
import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use } from 'react';

export function generateStaticParams() {
  return supportedLocales
    .map((locale) => tools.map((tool) => ({ locale, toolId: tool.id })))
    .flat();
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
          <p className="text-muted-foreground mt-2">{tool.description}</p>
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

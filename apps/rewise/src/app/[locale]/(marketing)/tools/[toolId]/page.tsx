import { tools } from '../data';
import { ToolForm } from './tool-form';
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
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function ToolDetailsPage({
  params,
}: {
  params: Promise<{
    locale: string;
    toolId: string;
  }>;
}) {
  const { toolId } = await params;
  const t = await getTranslations('common');
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
          {t('back')}
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

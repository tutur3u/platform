'use client';

import { Mic } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface VoiceAssistantCardProps {
  wsId: string;
}

export default function VoiceAssistantCard({ wsId }: VoiceAssistantCardProps) {
  const t = useTranslations('dashboard.voice_assistant');

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-dynamic-purple/10 via-transparent to-dynamic-blue/10" />
      <CardHeader className="relative pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-purple/15">
              <Mic className="h-4 w-4 text-dynamic-purple" />
            </div>
            <CardTitle className="text-base">{t('title')}</CardTitle>
          </div>
          <span className="rounded-full bg-dynamic-blue/15 px-2 py-0.5 font-medium text-dynamic-blue text-xs">
            {t('badge')}
          </span>
        </div>
        <CardDescription className="text-sm">{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="relative">
        <p className="mb-3 text-muted-foreground text-sm">{t('description')}</p>
        <Button asChild className="w-full">
          <Link href={`/${wsId}/assistant`}>
            <Mic className="mr-2 h-4 w-4" />
            {t('start_conversation')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

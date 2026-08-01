'use client';

import { MessageCircle, Mic } from '@tuturuuu/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import MiraDashboardClient from '../components/mira-dashboard-client';

const VoiceAssistant = dynamic(() => import('./assistant-client'), {
  ssr: false,
  loading: () => (
    <div className="h-[calc(100vh-10rem)] animate-pulse rounded-2xl border bg-muted/30" />
  ),
});

export function AssistantHub({
  currentUser,
  wsId,
}: {
  currentUser: {
    avatar_url?: string | null;
    display_name?: string | null;
    email?: string | null;
    full_name?: string | null;
    id: string;
  };
  wsId: string;
}) {
  const t = useTranslations('assistant-hub');

  return (
    <Tabs defaultValue="text" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <TabsList>
          <TabsTrigger value="text">
            <MessageCircle className="size-4" />
            {t('text')}
          </TabsTrigger>
          <TabsTrigger value="voice">
            <Mic className="size-4" />
            {t('voice')}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="text" className="min-h-0 flex-1">
        <MiraDashboardClient
          currentUser={currentUser}
          initialAssistantName="Mira"
          wsId={wsId}
        />
      </TabsContent>
      <TabsContent value="voice" className="min-h-0 flex-1">
        <VoiceAssistant wsId={wsId} />
      </TabsContent>
    </Tabs>
  );
}

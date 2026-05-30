'use client';

import { useQuery } from '@tanstack/react-query';
import { Bot } from '@tuturuuu/icons';
import {
  type ChatAttachment,
  listAiGatewayModels,
  type UpdateChatAiSettingsPayload,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useAiCredits } from '../../../hooks/use-ai-credits';
import { ScrollArea } from '../scroll-area';
import { toast } from '../sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';
import {
  LoadingState,
  SettingsPanel,
  SharedPanel,
  UsagePanel,
} from './chat-ai-details-panels';
import { resolveFallbackChatAiModelId } from './chat-ai-models';
import {
  useChatAiObservability,
  useChatAiSettings,
  useChatSharedContent,
  useUpdateChatAiSettings,
} from './hooks';

type SidebarTab = 'settings' | 'usage' | 'shared';

export function ChatAiDetailsSidebar({
  conversationId,
  onOpenAttachment,
  open,
  wsId,
}: {
  conversationId?: string | null;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  open: boolean;
  wsId: string;
}) {
  const t = useTranslations('chat');
  const settingsQuery = useChatAiSettings({
    conversationId,
    enabled: open,
    wsId,
  });
  const updateSettings = useUpdateChatAiSettings({ conversationId, wsId });
  const observabilityQuery = useChatAiObservability({
    conversationId,
    enabled: open,
    wsId,
  });
  const sharedContent = useChatSharedContent({
    conversationId,
    enabled: open,
    wsId,
  });
  const modelsQuery = useQuery({
    enabled: open,
    queryFn: () => listAiGatewayModels({ enabled: true, type: 'language' }),
    queryKey: ['chat-ai-models'],
    staleTime: 60_000,
  });
  const settings = settingsQuery.data;
  const models = modelsQuery.data ?? [];
  const autoSelectionKeyRef = useRef<string | null>(null);
  const personalCreditWsId = settings?.personalWorkspaceId ?? 'personal';
  const workspaceCredits = useAiCredits(open ? wsId : undefined);
  const personalCredits = useAiCredits(open ? personalCreditWsId : undefined);
  const shared = sharedContent.data ?? { files: [], links: [], photos: [] };

  async function patchSettings(payload: UpdateChatAiSettingsPayload) {
    try {
      await updateSettings.mutateAsync(payload);
      toast.success(t('ai_settings_saved'));
    } catch {
      toast.error(t('ai_settings_failed'));
    }
  }

  useEffect(() => {
    if (
      !open ||
      !settings ||
      modelsQuery.isLoading ||
      updateSettings.isPending
    ) {
      return;
    }

    const fallbackModelId = resolveFallbackChatAiModelId({
      currentModelId: settings.modelId,
      models,
    });
    if (!fallbackModelId) return;

    const autoSelectionKey = `${settings.conversationId}:${settings.modelId ?? 'none'}:${fallbackModelId}`;
    if (autoSelectionKeyRef.current === autoSelectionKey) return;
    autoSelectionKeyRef.current = autoSelectionKey;

    updateSettings.mutate({ modelId: fallbackModelId });
  }, [
    models,
    modelsQuery.isLoading,
    open,
    settings,
    updateSettings,
    updateSettings.isPending,
  ]);

  if (!open) return null;

  return (
    <aside className="hidden w-80 shrink-0 border-l bg-background md:flex md:flex-col">
      <Tabs
        className="min-h-0 flex-1 gap-0"
        defaultValue="settings"
        orientation="vertical"
      >
        <div className="border-b p-3">
          <h2 className="flex items-center gap-2 font-semibold text-sm">
            <Bot className="size-4" />
            {t('ai_details')}
          </h2>
          <TabsList className="mt-3 grid h-9 w-full grid-cols-3 rounded-md">
            <TabsTrigger className="text-xs" value="settings" asChild>
              <button type="button">{t('ai_settings')}</button>
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="usage" asChild>
              <button type="button">{t('ai_usage')}</button>
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="shared" asChild>
              <button type="button">{t('shared')}</button>
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent
            className="m-0 p-3"
            value={'settings' satisfies SidebarTab}
          >
            <SettingsPanel
              creditSources={{
                personal: {
                  credits: personalCredits.data,
                  isError: personalCredits.isError,
                  isLoading: personalCredits.isLoading,
                },
                workspace: {
                  credits: workspaceCredits.data,
                  isError: workspaceCredits.isError,
                  isLoading: workspaceCredits.isLoading,
                },
              }}
              isLoading={settingsQuery.isLoading}
              models={models}
              onCreditSourceChange={(creditSource) =>
                patchSettings({
                  creditSource,
                  creditWsId:
                    creditSource === 'personal'
                      ? (settings?.personalWorkspaceId ?? null)
                      : null,
                })
              }
              onModelChange={(modelId) => patchSettings({ modelId })}
              onThinkingModeChange={(thinkingMode) =>
                patchSettings({ thinkingMode })
              }
              settings={settings}
              t={t}
            />
          </TabsContent>

          <TabsContent className="m-0 p-3" value={'usage' satisfies SidebarTab}>
            <UsagePanel
              isLoading={observabilityQuery.isLoading}
              observability={observabilityQuery.data}
              t={t}
            />
          </TabsContent>

          <TabsContent
            className="m-0 p-3"
            value={'shared' satisfies SidebarTab}
          >
            {sharedContent.isLoading ? (
              <LoadingState label={t('loading_shared_content')} />
            ) : (
              <SharedPanel
                files={shared.files}
                links={shared.links}
                onOpenAttachment={onOpenAttachment}
                photos={shared.photos}
                t={t}
              />
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Search, Trash2 } from '@tuturuuu/icons';
import {
  exportWorkspaceAiMemoryItems,
  getWorkspaceAiMemorySettings,
  updateWorkspaceAiMemorySettings,
} from '@tuturuuu/internal-api/ai-memory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Fragment, useCallback, useMemo, useState } from 'react';
import {
  useDeleteMiraMemory,
  useMiraMemories,
} from '../../../app/[locale]/(dashboard)/[wsId]/(dashboard)/hooks/use-mira-memories';

const AI_MEMORY_PRODUCT_OPTIONS = [
  'mira',
  'ai_chat',
  'native_chat',
  'mind',
  'ai_agents',
  'meetings',
  'education',
  'finance',
  'tasks',
  'hive',
  'teach',
  'calendar',
  'live_assistant',
  'memories',
  'object_generation',
  'playground',
  'rewise',
] as const;

interface MiraMemorySettingsProps {
  wsId?: string;
}

export function MiraMemorySettings({ wsId }: MiraMemorySettingsProps) {
  const t = useTranslations('settings.mira');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useMiraMemories(wsId ?? '');
  const { mutate: deleteMemory, isPending: isDeleting } = useDeleteMiraMemory(
    wsId ?? ''
  );
  const settingsQuery = useQuery({
    enabled: Boolean(wsId),
    queryKey: ['ai-memory-settings', wsId, 'mira'],
    queryFn: () =>
      getWorkspaceAiMemorySettings(wsId ?? '', {
        product: 'mira',
      }),
  });
  const updateSettingsMutation = useMutation({
    mutationFn: (payload: {
      enabled: boolean;
      products: Record<string, boolean>;
    }) => updateWorkspaceAiMemorySettings(wsId ?? '', payload),
    onSuccess: (settings) => {
      queryClient.setQueryData(['ai-memory-settings', wsId, 'mira'], settings);
      toast.success(t('memory_settings_saved'));
    },
    onError: () => {
      toast.error(t('memory_settings_save_failed'));
    },
  });
  const exportMutation = useMutation({
    mutationFn: () =>
      exportWorkspaceAiMemoryItems(wsId ?? '', {
        product: 'mira',
      }),
    onSuccess: (exported) => {
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tuturuuu-ai-memories-${new Date().toISOString()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: () => {
      toast.error(t('memory_export_failed'));
    },
  });

  const handleDelete = useCallback(
    (memoryId: string) => {
      if (!wsId) return;
      deleteMemory(memoryId, {
        onSuccess: () => {
          toast.success(t('memory_deleted'));
        },
      });
    },
    [deleteMemory, t, wsId]
  );

  const settings = settingsQuery.data;
  const products = settings?.products ?? {};
  const globallyEnabled = settings?.enabled ?? true;
  const filteredMemories = useMemo(() => {
    const memories = data?.memories ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return memories;

    return memories.filter((memory) =>
      [memory.category, memory.key, memory.value, memory.source ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [data?.memories, search]);
  const grouped = useMemo(
    () =>
      filteredMemories.reduce(
        (acc, memory) => {
          const category = memory.category;
          acc[category] ??= [];
          acc[category].push(memory);
          return acc;
        },
        {} as Record<string, NonNullable<typeof data>['memories']>
      ),
    [filteredMemories]
  );
  const categories = Object.keys(grouped).sort();

  if (!wsId) {
    return (
      <SettingsSection>
        <SettingsSectionMessage tone="default">
          {t('workspace_required')}
        </SettingsSectionMessage>
      </SettingsSection>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const productTogglesDisabled =
    !globallyEnabled ||
    settingsQuery.isLoading ||
    updateSettingsMutation.isPending;

  return (
    <div className="space-y-8">
      <SettingsSection>
        <SettingItemTab
          title={t('ai_memory')}
          description={t('ai_memory_description')}
        >
          <Switch
            checked={globallyEnabled}
            disabled={
              settingsQuery.isLoading || updateSettingsMutation.isPending
            }
            onCheckedChange={(enabled) =>
              updateSettingsMutation.mutate({ enabled, products })
            }
          />
        </SettingItemTab>

        <SettingsSectionBlock className="@container py-2">
          <div className="grid @lg:grid-cols-2 gap-x-8">
            {AI_MEMORY_PRODUCT_OPTIONS.map((product) => (
              <div
                key={product}
                className="flex items-center justify-between gap-3 py-2"
              >
                <Label
                  htmlFor={`ai-memory-${product}`}
                  className={cn(
                    'text-sm',
                    !globallyEnabled &&
                      'cursor-not-allowed text-muted-foreground'
                  )}
                >
                  {t(`product_${product}`)}
                </Label>
                <Switch
                  id={`ai-memory-${product}`}
                  checked={products[product] ?? true}
                  disabled={productTogglesDisabled}
                  onCheckedChange={(enabled) =>
                    updateSettingsMutation.mutate({
                      enabled: globallyEnabled,
                      products: { ...products, [product]: enabled },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </SettingsSectionBlock>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionBlock className="flex flex-col gap-3 py-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('search_memories')}
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <Download className="h-4 w-4" />
            {t('export_memories')}
          </Button>
        </SettingsSectionBlock>

        {!categories.length && (
          <SettingsSectionMessage>
            <div className="space-y-1">
              <p className="font-medium text-foreground">{t('no_memories')}</p>
              <p>{t('no_memories_description')}</p>
            </div>
          </SettingsSectionMessage>
        )}

        {categories.map((category) => {
          const memories = grouped[category] ?? [];
          return (
            <Fragment key={category}>
              <SettingsSectionBlock className="flex items-center gap-2 py-2.5">
                <Badge variant="outline">{category.replace('_', ' ')}</Badge>
                <span className="text-muted-foreground text-xs">
                  ({memories.length})
                </span>
              </SettingsSectionBlock>
              {memories.map((memory) => (
                <SettingsSectionBlock
                  className="group flex items-start gap-3 py-3 transition-colors hover:bg-muted/30"
                  key={memory.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{memory.key}</p>
                    <p className="mt-0.5 text-muted-foreground text-sm">
                      {memory.value}
                    </p>
                    {memory.confidence < 1 && (
                      <p className="mt-1 text-muted-foreground text-xs">
                        {t('confidence', {
                          value: Math.round(memory.confidence * 100),
                        })}
                      </p>
                    )}
                  </div>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 pointer-coarse:opacity-100 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t('delete_memory')}</DialogTitle>
                        <DialogDescription>
                          {t('delete_memory_confirm')}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="rounded-lg border p-3">
                        <p className="font-medium text-sm">{memory.key}</p>
                        <p className="mt-1 text-muted-foreground text-sm">
                          {memory.value}
                        </p>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline" size="sm">
                            {t('cancel')}
                          </Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(memory.id)}
                          >
                            {t('delete_memory')}
                          </Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </SettingsSectionBlock>
              ))}
            </Fragment>
          );
        })}
      </SettingsSection>
    </div>
  );
}

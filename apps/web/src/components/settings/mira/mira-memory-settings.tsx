'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Download, Search, Trash2 } from '@tuturuuu/icons';
import {
  exportWorkspaceAiMemoryItems,
  getWorkspaceAiMemorySettings,
  updateWorkspaceAiMemorySettings,
} from '@tuturuuu/internal-api/ai-memory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
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
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  useDeleteMiraMemory,
  useMiraMemories,
} from '../../../app/[locale]/(dashboard)/[wsId]/(dashboard)/hooks/use-mira-memories';

const CATEGORY_COLORS: Record<string, string> = {
  preference: 'bg-dynamic-blue/15 text-dynamic-blue',
  fact: 'bg-dynamic-green/15 text-dynamic-green',
  conversation_topic: 'bg-dynamic-purple/15 text-dynamic-purple',
  event: 'bg-dynamic-orange/15 text-dynamic-orange',
  person: 'bg-dynamic-pink/15 text-dynamic-pink',
};

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
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Brain className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-center font-medium text-sm">
          {t('workspace_required')}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const controls = (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-sm">{t('ai_memory')}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('ai_memory_description')}
          </p>
        </div>
        <Switch
          checked={globallyEnabled}
          disabled={settingsQuery.isLoading || updateSettingsMutation.isPending}
          onCheckedChange={(enabled) =>
            updateSettingsMutation.mutate({ enabled, products })
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {AI_MEMORY_PRODUCT_OPTIONS.map((product) => (
          <div
            key={product}
            className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
          >
            <Label htmlFor={`ai-memory-${product}`} className="text-sm">
              {t(`product_${product}`)}
            </Label>
            <Switch
              id={`ai-memory-${product}`}
              checked={products[product] ?? true}
              disabled={
                !globallyEnabled ||
                settingsQuery.isLoading ||
                updateSettingsMutation.isPending
              }
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
    </div>
  );

  const toolbar = (
    <div className="flex flex-col gap-3 sm:flex-row">
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
    </div>
  );

  if (!categories.length) {
    return (
      <div className="space-y-6">
        {controls}
        {toolbar}
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Brain className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium text-sm">{t('no_memories')}</p>
            <p className="mt-1 max-w-xs text-muted-foreground text-xs">
              {t('no_memories_description')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {controls}
      {toolbar}
      {categories.map((category) => {
        const memories = grouped[category] ?? [];
        return (
          <div key={category}>
            <div className="mb-3 flex items-center gap-2">
              <Badge
                variant="secondary"
                className={CATEGORY_COLORS[category] ?? ''}
              >
                {category.replace('_', ' ')}
              </Badge>
              <span className="text-muted-foreground text-xs">
                ({memories.length})
              </span>
            </div>
            <div className="space-y-2">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="group flex items-start gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{memory.key}</p>
                    <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                      {memory.value}
                    </p>
                    {memory.confidence < 1 && (
                      <p className="mt-1 text-muted-foreground/60 text-xs">
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
                        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
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
                        <p className="mt-1 text-muted-foreground text-xs">
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
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

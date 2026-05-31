'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  Download,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from '@tuturuuu/icons';
import {
  type AiMemoryItem,
  createWorkspaceAiMemoryItem,
  deleteWorkspaceAiMemoryItem,
  exportWorkspaceAiMemoryItems,
  listWorkspaceAiMemoryItems,
} from '@tuturuuu/internal-api/ai-memory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

const MEMORY_PRODUCTS = [
  'memories',
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getMemoryText(item: AiMemoryItem) {
  return item.value || item.content || item.summary || item.title || '';
}

function getMemoryCategory(item: AiMemoryItem) {
  const metadata = item.metadata ?? {};
  return typeof metadata.memoryCategory === 'string'
    ? metadata.memoryCategory
    : item.category || null;
}

function getMemoryKey(item: AiMemoryItem) {
  const metadata = item.metadata ?? {};
  return typeof metadata.memoryKey === 'string'
    ? metadata.memoryKey
    : item.key || item.title || null;
}

export function MemoriesClient({ wsId }: { wsId: string }) {
  const t = useTranslations('ws-memories');
  const productT = useTranslations('settings.mira');
  const queryClient = useQueryClient();
  const [product, setProduct] =
    useState<(typeof MEMORY_PRODUCTS)[number]>('memories');
  const [category, setCategory] = useState('');
  const [queryDraft, setQueryDraft] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [limit, setLimit] = useState('50');
  const [newCategory, setNewCategory] = useState('fact');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const parsedLimit = Math.min(
    Math.max(Number.parseInt(limit || '50', 10) || 50, 1),
    500
  );
  const queryKey = [
    'workspace-ai-memory-items',
    wsId,
    product,
    category,
    activeQuery,
    parsedLimit,
  ];

  const memoriesQuery = useQuery({
    enabled: Boolean(wsId),
    queryKey,
    queryFn: () =>
      listWorkspaceAiMemoryItems(wsId, {
        category: category || undefined,
        limit: parsedLimit,
        product,
        q: activeQuery || undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createWorkspaceAiMemoryItem(wsId, {
        category: newCategory || undefined,
        key: newKey || undefined,
        product,
        source: 'memory_explorer',
        value: newValue,
      }),
    onSuccess: (response) => {
      if (response.skipped) {
        toast.error(t('memory_skipped', { reason: response.reason ?? '-' }));
        return;
      }

      setNewKey('');
      setNewValue('');
      toast.success(t('memory_created'));
      queryClient.invalidateQueries({
        queryKey: ['workspace-ai-memory-items', wsId],
      });
    },
    onError: () => toast.error(t('memory_create_failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (memoryId: string) =>
      deleteWorkspaceAiMemoryItem(wsId, memoryId, { product }),
    onSuccess: () => {
      toast.success(t('memory_deleted'));
      queryClient.invalidateQueries({
        queryKey: ['workspace-ai-memory-items', wsId],
      });
    },
    onError: () => toast.error(t('memory_delete_failed')),
  });

  const exportMutation = useMutation({
    mutationFn: () => exportWorkspaceAiMemoryItems(wsId, { product }),
    onSuccess: (exported) => {
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tuturuuu-${product}-memories-${new Date().toISOString()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error(t('memory_export_failed')),
  });

  const items = memoriesQuery.data?.items ?? [];
  const metadataKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of items) {
      for (const key of Object.keys(item.metadata ?? {})) {
        keys.add(key);
      }
    }
    return [...keys].sort();
  }, [items]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="space-y-6">
        <section className="rounded-lg border bg-background p-4">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setActiveQuery(queryDraft.trim());
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="memory-product">{t('product')}</Label>
              <Select
                value={product}
                onValueChange={(value) =>
                  setProduct(value as (typeof MEMORY_PRODUCTS)[number])
                }
              >
                <SelectTrigger id="memory-product">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_PRODUCTS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {productT(`product_${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_96px] lg:grid-cols-1">
              <div className="space-y-2">
                <Label htmlFor="memory-category">{t('category')}</Label>
                <Input
                  id="memory-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memory-limit">{t('limit')}</Label>
                <Input
                  id="memory-limit"
                  inputMode="numeric"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="memory-query">{t('query')}</Label>
              <Input
                id="memory-query"
                value={queryDraft}
                onChange={(event) => setQueryDraft(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                className="gap-2"
                disabled={memoriesQuery.isFetching}
              >
                <Search className="h-4 w-4" />
                {t('search')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => memoriesQuery.refetch()}
                disabled={memoriesQuery.isFetching}
              >
                <RefreshCw className="h-4 w-4" />
                {t('refresh')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
              >
                <Download className="h-4 w-4" />
                {t('export')}
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-lg border bg-background p-4">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newValue.trim()) return;
              createMutation.mutate();
            }}
          >
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-medium text-sm">{t('new_memory')}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-2">
                <Label htmlFor="new-memory-category">{t('category')}</Label>
                <Input
                  id="new-memory-category"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-memory-key">{t('key')}</Label>
                <Input
                  id="new-memory-key"
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-memory-value">{t('value')}</Label>
              <Textarea
                id="new-memory-value"
                value={newValue}
                onChange={(event) => setNewValue(event.target.value)}
                className="min-h-28"
              />
            </div>
            <Button
              type="submit"
              className="gap-2"
              disabled={createMutation.isPending || !newValue.trim()}
            >
              <Plus className="h-4 w-4" />
              {t('remember')}
            </Button>
          </form>
        </section>
      </div>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">{t('results')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('result_count', { count: items.length })}
            </p>
          </div>
          {activeQuery ? (
            <Badge variant="secondary">
              {t('query_badge', { query: activeQuery })}
            </Badge>
          ) : null}
        </div>

        {metadataKeys.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {metadataKeys.slice(0, 12).map((key) => (
              <Badge key={key} variant="outline">
                {key}
              </Badge>
            ))}
          </div>
        ) : null}

        {memoriesQuery.isLoading ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
            {t('loading')}
          </div>
        ) : memoriesQuery.isError ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
            {t('load_failed')}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
            {t('empty')}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const categoryValue = getMemoryCategory(item);
              const keyValue = getMemoryKey(item);
              const text = getMemoryText(item);

              return (
                <article
                  key={item.id}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {categoryValue ? (
                          <Badge variant="secondary">{categoryValue}</Badge>
                        ) : null}
                        {keyValue ? (
                          <Badge variant="outline">{keyValue}</Badge>
                        ) : null}
                        {typeof item.score === 'number' ? (
                          <Badge variant="outline">
                            {t('score', { score: item.score.toFixed(3) })}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {text}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => deleteMutation.mutate(item.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('delete')}
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 text-muted-foreground text-xs md:grid-cols-[220px_1fr]">
                    <div className="font-mono">{item.id}</div>
                    <div className="md:text-right">
                      {formatDate(item.updatedAt)}
                    </div>
                  </div>
                  {item.metadata ? (
                    <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(item.metadata, null, 2)}
                    </pre>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

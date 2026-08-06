'use client';

import { Loader2 } from '@tuturuuu/icons';
import type {
  TaskCapacityCountingMode,
  TaskCapacityEnforcement,
  TaskCapacityMatchMode,
  TaskCapacityMetric,
} from '@tuturuuu/internal-api/tasks';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export type CapacityDraft = {
  countingMode: TaskCapacityCountingMode;
  enforcement: TaskCapacityEnforcement;
  labelIds: string[];
  labelMatchMode: TaskCapacityMatchMode;
  limit: number;
  listIds: string[];
  metric: TaskCapacityMetric;
  name: string;
  projectIds: string[];
  projectMatchMode: TaskCapacityMatchMode;
};

export type SelectorItem = { id: string; name: string };

export type SelectorGroup = {
  items: SelectorItem[];
  key: 'lists' | 'labels' | 'projects';
  title: string;
};

export function createEmptyDraft(initialListId?: string): CapacityDraft {
  return {
    countingMode: 'active',
    enforcement: 'soft',
    labelIds: [],
    labelMatchMode: 'any',
    limit: 5,
    listIds: initialListId ? [initialListId] : [],
    metric: 'task_count',
    name: '',
    projectIds: [],
    projectMatchMode: 'any',
  };
}

const selectionKeyByGroup = {
  lists: 'listIds',
  labels: 'labelIds',
  projects: 'projectIds',
} as const;

/**
 * The rule form, split across a Rule tab (what the limit is) and a Selectors
 * tab (what it applies to). Flattening all eleven controls into one column is
 * what made this read as a wall of inputs; the split also keeps the three
 * selector lists tall enough to scroll comfortably.
 */
export function CapacityRuleEditor({
  initialDraft,
  isSaving,
  onCancel,
  onSubmit,
  selectorGroups,
}: {
  initialDraft: CapacityDraft;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (draft: CapacityDraft) => void;
  selectorGroups: SelectorGroup[];
}) {
  const t = useTranslations('ws-board-templates.capacity');
  const [draft, setDraft] = useState<CapacityDraft>(initialDraft);
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLowerCase();

  const patch = (updates: Partial<CapacityDraft>) =>
    setDraft((current) => ({ ...current, ...updates }));

  const selectedCount =
    draft.listIds.length + draft.labelIds.length + draft.projectIds.length;

  const filteredGroups = useMemo(
    () =>
      selectorGroups.map((group) => ({
        ...group,
        filtered: normalizedSearch
          ? group.items.filter((item) =>
              item.name.toLowerCase().includes(normalizedSearch)
            )
          : group.items,
      })),
    [normalizedSearch, selectorGroups]
  );

  const toggleSelection = (group: SelectorGroup, itemId: string) => {
    const key = selectionKeyByGroup[group.key];
    const current = draft[key];
    patch({
      [key]: current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    } as Partial<CapacityDraft>);
  };

  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <Tabs className="space-y-4" defaultValue="rule">
        <TabsList>
          <TabsTrigger value="rule">{t('tab_rule')}</TabsTrigger>
          <TabsTrigger value="selectors">
            {t('tab_selectors')}
            {selectedCount > 0 && (
              <Badge className="ml-2" variant="secondary">
                {selectedCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="rule">
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-2">
              <Label htmlFor="capacity-name">{t('name')}</Label>
              <Input
                id="capacity-name"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity-limit">{t('limit')}</Label>
              <Input
                id="capacity-limit"
                type="number"
                min={1}
                value={draft.limit}
                onChange={(event) =>
                  patch({ limit: Number(event.target.value) })
                }
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="capacity-metric">{t('metric')}</Label>
              <Select
                value={draft.metric}
                onValueChange={(value) =>
                  patch({ metric: value as TaskCapacityMetric })
                }
              >
                <SelectTrigger id="capacity-metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task_count">{t('task_count')}</SelectItem>
                  <SelectItem value="estimation_points">
                    {t('estimation_points')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity-enforcement">{t('enforcement')}</Label>
              <Select
                value={draft.enforcement}
                onValueChange={(value) =>
                  patch({ enforcement: value as TaskCapacityEnforcement })
                }
              >
                <SelectTrigger id="capacity-enforcement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="soft">{t('soft')}</SelectItem>
                  <SelectItem value="hard">{t('hard')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity-counting">{t('counting_mode')}</Label>
              <Select
                value={draft.countingMode}
                onValueChange={(value) =>
                  patch({ countingMode: value as TaskCapacityCountingMode })
                }
              >
                <SelectTrigger id="capacity-counting">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('active')}</SelectItem>
                  <SelectItem value="all_non_deleted">
                    {t('all_non_deleted')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        <TabsContent className="space-y-4" value="selectors">
          <div className="space-y-2">
            <Label htmlFor="capacity-selector-search">
              {t('search_selectors')}
            </Label>
            <Input
              id="capacity-selector-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('search_placeholder')}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="capacity-label-match">
                {t('label_matching')}
              </Label>
              <Select
                value={draft.labelMatchMode}
                onValueChange={(value) =>
                  patch({ labelMatchMode: value as TaskCapacityMatchMode })
                }
              >
                <SelectTrigger id="capacity-label-match">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t('any')}</SelectItem>
                  <SelectItem value="all">{t('all')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity-project-match">
                {t('project_matching')}
              </Label>
              <Select
                value={draft.projectMatchMode}
                onValueChange={(value) =>
                  patch({ projectMatchMode: value as TaskCapacityMatchMode })
                }
              >
                <SelectTrigger id="capacity-project-match">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t('any')}</SelectItem>
                  <SelectItem value="all">{t('all')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {filteredGroups.map((group) => {
              const selected = draft[selectionKeyByGroup[group.key]];
              return (
                <div key={group.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs">{group.title}</span>
                    {selected.length > 0 && (
                      <span className="text-muted-foreground text-xs">
                        {selected.length}
                      </span>
                    )}
                  </div>
                  <div className="max-h-44 space-y-1 overflow-auto rounded-md border p-2">
                    {group.filtered.length === 0 ? (
                      <p className="px-2 py-1 text-muted-foreground text-xs">
                        {t('empty_selector')}
                      </p>
                    ) : (
                      group.filtered.map((item) => {
                        const isSelected = selected.includes(item.id);
                        return (
                          <button
                            type="button"
                            key={item.id}
                            aria-pressed={isSelected}
                            className={cn(
                              'block w-full rounded px-2 py-1 text-left text-xs transition-colors',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-muted'
                            )}
                            onClick={() => toggleSelection(group, item.id)}
                          >
                            {item.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          disabled={!draft.name.trim() || draft.limit < 1 || isSaving}
          onClick={() => onSubmit(draft)}
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('save')}
        </Button>
      </div>
    </div>
  );
}

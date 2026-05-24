'use client';

import type { HiveWorkflowNodeType } from '@tuturuuu/internal-api/hive';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { type WorkflowTemplateKey, workflowCatalog } from './workflow-catalog';

type WorkflowPaletteProps = {
  isAdmin: boolean;
  onAddNode: (type: HiveWorkflowNodeType) => void;
  onUseTemplate: (template: WorkflowTemplateKey) => void;
};

const templates: WorkflowTemplateKey[] = [
  'agent_roundtable',
  'npc_daily',
  'farm_cycle',
  'market_trade',
  'world_cleanup',
  'simulation_tick',
];

export function WorkflowPalette({
  isAdmin,
  onAddNode,
  onUseTemplate,
}: WorkflowPaletteProps) {
  const t = useTranslations('studio.workflows');
  const translateWorkflowKey = useCallback(
    (key: string) => t(key as never),
    [t]
  );
  const [query, setQuery] = useState('');
  const filteredCatalog = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return workflowCatalog;
    return workflowCatalog.filter((item) =>
      translateWorkflowKey(`nodes.${item.labelKey}`)
        .toLowerCase()
        .includes(normalized)
    );
  }, [query, translateWorkflowKey]);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-background/95 backdrop-blur-xl">
      <div className="shrink-0 border-border/70 border-b bg-background/80 p-3">
        <Input
          aria-label={t('palette.search')}
          className="h-9"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('palette.search')}
          value={query}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-3">
          <section className="grid gap-1.5">
            <p className="font-medium text-muted-foreground text-xs">
              {t('palette.templates')}
            </p>
            {templates.map((template) => (
              <button
                className="rounded-md border border-border/80 bg-background/80 p-2.5 text-left transition-[background-color,border-color,color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-dynamic-green/60 hover:bg-dynamic-green/5 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!isAdmin}
                key={template}
                onClick={() => onUseTemplate(template)}
                type="button"
              >
                <span className="font-medium text-sm">
                  {translateWorkflowKey(`templates.${template}.name`)}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-muted-foreground text-xs">
                  {translateWorkflowKey(`templates.${template}.description`)}
                </span>
              </button>
            ))}
          </section>
          <section className="grid gap-1.5">
            <p className="font-medium text-muted-foreground text-xs">
              {t('palette.nodes')}
            </p>
            {filteredCatalog.map(({ icon: Icon, labelKey, type }) => (
              <button
                className="flex items-center gap-2 rounded-md border border-border/80 bg-background/80 p-2 text-left text-sm transition-[background-color,border-color,color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-dynamic-green/60 hover:bg-dynamic-green/5 hover:text-dynamic-green disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!isAdmin}
                draggable={isAdmin}
                key={type}
                onClick={() => onAddNode(type)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    'application/hive-node-type',
                    type
                  );
                  event.dataTransfer.effectAllowed = 'move';
                }}
                type="button"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{translateWorkflowKey(`nodes.${labelKey}`)}</span>
              </button>
            ))}
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}

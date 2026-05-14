'use client';

import type { HiveWorkflowNodeType } from '@tuturuuu/internal-api/hive';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { type WorkflowTemplateKey, workflowCatalog } from './workflow-catalog';

type WorkflowPaletteProps = {
  isAdmin: boolean;
  onAddNode: (type: HiveWorkflowNodeType) => void;
  onUseTemplate: (template: WorkflowTemplateKey) => void;
};

const templates: WorkflowTemplateKey[] = [
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
  const [query, setQuery] = useState('');
  const filteredCatalog = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return workflowCatalog;
    return workflowCatalog.filter((item) =>
      t(`nodes.${item.labelKey}`).toLowerCase().includes(normalized)
    );
  }, [query, t]);

  return (
    <aside className="flex h-full flex-col border-border/70 border-r bg-background/90 backdrop-blur-xl">
      <div className="border-border/70 border-b p-4">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {t('palette.eyebrow')}
        </p>
        <h2 className="mt-1 font-semibold text-lg">{t('palette.title')}</h2>
        <Input
          aria-label={t('palette.search')}
          className="mt-3"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('palette.search')}
          value={query}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          <section className="grid gap-2">
            <p className="font-medium text-muted-foreground text-xs">
              {t('palette.templates')}
            </p>
            {templates.map((template) => (
              <Button
                className="justify-start"
                disabled={!isAdmin}
                key={template}
                onClick={() => onUseTemplate(template)}
                type="button"
                variant="outline"
              >
                {t(`templates.${template}.name`)}
              </Button>
            ))}
          </section>
          <section className="grid gap-2">
            <p className="font-medium text-muted-foreground text-xs">
              {t('palette.nodes')}
            </p>
            {filteredCatalog.map(({ icon: Icon, labelKey, type }) => (
              <button
                className="flex items-center gap-2 rounded-md border border-border bg-background p-2 text-left text-sm transition hover:border-dynamic-green/60 hover:text-dynamic-green disabled:cursor-not-allowed disabled:opacity-60"
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
                <span>{t(`nodes.${labelKey}`)}</span>
              </button>
            ))}
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}

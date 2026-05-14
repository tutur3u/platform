'use client';

import { BookOpen, MousePointer2, Play, Route } from '@tuturuuu/icons';
import type { HiveWorkflowNodeType } from '@tuturuuu/internal-api/hive';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
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

const tutorialSteps: Array<{
  icon: ComponentType<{ className?: string }>;
  key: 'connect' | 'run' | 'template';
}> = [
  { icon: BookOpen, key: 'template' },
  { icon: Route, key: 'connect' },
  { icon: Play, key: 'run' },
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
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-border/70 border-r bg-background/95 backdrop-blur-xl">
      <div className="shrink-0 border-border/70 border-b bg-dynamic-green/5 p-4">
        <p className="text-dynamic-green text-xs uppercase tracking-wide">
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
          <section
            aria-label={t('tutorial.label')}
            className="rounded-lg border border-dynamic-green/30 bg-dynamic-green/10 p-3"
          >
            <div className="flex gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dynamic-green/30 bg-background/70 text-dynamic-green">
                <MousePointer2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{t('tutorial.title')}</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {t('tutorial.body')}
                </p>
              </div>
            </div>
            <ol className="mt-3 grid gap-2">
              {tutorialSteps.map(({ icon: Icon, key }, index) => (
                <li className="flex gap-2" key={key}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground text-xs">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-medium text-xs">
                      <Icon className="h-3.5 w-3.5 text-dynamic-green" />
                      {t(`tutorial.steps.${key}.title`)}
                    </p>
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      {t(`tutorial.steps.${key}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="grid gap-2">
            <p className="font-medium text-muted-foreground text-xs">
              {t('palette.templates')}
            </p>
            {templates.map((template) => (
              <button
                className="rounded-lg border border-border bg-background p-3 text-left transition hover:border-dynamic-green/60 hover:bg-dynamic-green/5 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!isAdmin}
                key={template}
                onClick={() => onUseTemplate(template)}
                type="button"
              >
                <span className="font-medium text-sm">
                  {t(`templates.${template}.name`)}
                </span>
                <span className="mt-1 block text-muted-foreground text-xs">
                  {t(`templates.${template}.description`)}
                </span>
              </button>
            ))}
          </section>
          <section className="grid gap-2">
            <p className="font-medium text-muted-foreground text-xs">
              {t('palette.nodes')}
            </p>
            {filteredCatalog.map(({ icon: Icon, labelKey, type }) => (
              <button
                className="flex items-center gap-2 rounded-lg border border-border bg-background p-2.5 text-left text-sm transition hover:border-dynamic-green/60 hover:bg-dynamic-green/5 hover:text-dynamic-green disabled:cursor-not-allowed disabled:opacity-60"
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

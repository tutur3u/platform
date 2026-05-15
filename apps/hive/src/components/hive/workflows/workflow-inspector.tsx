'use client';

import { BookOpen, Braces, Trash2 } from '@tuturuuu/icons';
import type {
  HiveJsonObject,
  HiveWorkflowNode,
} from '@tuturuuu/internal-api/hive';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';

type WorkflowInspectorProps = {
  isAdmin: boolean;
  node: HiveWorkflowNode | null;
  onChange: (nodeId: string, patch: Partial<HiveWorkflowNode>) => void;
  onDelete: (nodeId: string) => void;
  validationErrors: string[];
};

export function WorkflowInspector({
  isAdmin,
  node,
  onChange,
  onDelete,
  validationErrors,
}: WorkflowInspectorProps) {
  const t = useTranslations('studio.workflows.inspector');

  if (!node) {
    return (
      <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-background/95 backdrop-blur-xl">
        <div className="shrink-0 border-border/70 border-b bg-background/80 p-3">
          <p className="font-medium text-sm">{t('empty_title')}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('empty_body')}
          </p>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-3 p-3">
            {validationErrors.length > 0 ? (
              <ValidationErrors errors={validationErrors} />
            ) : null}
            <InspectorGuide />
          </div>
        </ScrollArea>
      </aside>
    );
  }

  const configText = JSON.stringify(node.data.config ?? {}, null, 2);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-background/95 backdrop-blur-xl">
      <div className="shrink-0 border-border/70 border-b bg-background/80 p-3">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {node.type}
        </p>
        <h2 className="mt-1 font-semibold text-base">{node.data.label}</h2>
        {!isAdmin ? (
          <p className="mt-2 rounded-md border border-border bg-muted/30 px-2 py-1 text-muted-foreground text-xs">
            {t('read_only')}
          </p>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          {validationErrors.length > 0 ? (
            <ValidationErrors errors={validationErrors} />
          ) : null}
          <InspectorGuide compact />
          <label className="grid gap-1.5">
            <span className="font-medium text-xs">{t('node_label')}</span>
            <Input
              aria-label={t('node_label')}
              disabled={!isAdmin}
              onChange={(event) =>
                onChange(node.id, {
                  data: { ...node.data, label: event.target.value },
                })
              }
              value={node.data.label}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="font-medium text-xs">{t('node_config')}</span>
            <Textarea
              aria-label={t('node_config')}
              className="min-h-48 font-mono text-xs"
              defaultValue={configText}
              disabled={!isAdmin}
              key={`${node.id}:${node.type}`}
              onBlur={(event) => {
                if (!isAdmin) return;
                try {
                  const config = JSON.parse(
                    event.target.value
                  ) as HiveJsonObject;
                  onChange(node.id, {
                    data: { ...node.data, config },
                  });
                } catch {
                  onChange(node.id, { data: node.data });
                }
              }}
            />
          </label>
          {isAdmin ? (
            <Button
              className="h-9 justify-start"
              onClick={() => onDelete(node.id)}
              type="button"
              variant="destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('delete_node')}
            </Button>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );
}

function InspectorGuide({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('studio.workflows.inspector');

  return (
    <div className="rounded-md border border-dynamic-blue/30 bg-dynamic-blue/10 p-2.5">
      <div className="flex gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dynamic-blue/30 bg-background/70 text-dynamic-blue">
          {compact ? (
            <Braces className="h-4 w-4" />
          ) : (
            <BookOpen className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{t('guide_title')}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {compact ? t('guide_compact') : t('guide_body')}
          </p>
        </div>
      </div>
      <code className="mt-2 block rounded-md border border-border bg-background px-2 py-1 font-mono text-muted-foreground text-xs">
        {'{{steps.context.output.revision}}'}
      </code>
    </div>
  );
}

function ValidationErrors({ errors }: { errors: string[] }) {
  const t = useTranslations('studio.workflows.inspector');

  return (
    <div className="rounded-md border border-dynamic-red/40 bg-dynamic-red/10 p-3 text-dynamic-red text-xs">
      <p className="font-medium">{t('validation_title')}</p>
      <ul className="mt-2 grid gap-1">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

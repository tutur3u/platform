'use client';

import { Trash2 } from '@tuturuuu/icons';
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
      <aside className="flex h-full flex-col border-border/70 border-l bg-background/88 p-4 backdrop-blur-xl">
        <p className="font-medium text-sm">{t('empty_title')}</p>
        <p className="mt-1 text-muted-foreground text-xs">{t('empty_body')}</p>
        {validationErrors.length > 0 ? (
          <ValidationErrors errors={validationErrors} />
        ) : null}
      </aside>
    );
  }

  const configText = JSON.stringify(node.data.config ?? {}, null, 2);

  return (
    <aside className="flex h-full flex-col border-border/70 border-l bg-background/90 backdrop-blur-xl">
      <div className="border-border/70 border-b p-4">
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
        <div className="grid gap-4 p-4">
          {validationErrors.length > 0 ? (
            <ValidationErrors errors={validationErrors} />
          ) : null}
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
              className="justify-start"
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

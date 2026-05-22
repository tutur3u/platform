'use client';

import { GitMerge, Route } from '@tuturuuu/icons';
import type { MindEdge, MindNode } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { ColorPicker, Field, InspectorHeader } from './mind-inspector-shared';
import { MIND_EDGE_TYPES } from './model';

type Props = {
  edge: MindEdge;
  nodes: MindNode[];
  onDeleteEdge: (edgeId: string) => void;
  onSmartPrompt?: (prompt: string) => void;
  onUpdateEdge: (edgeId: string, patch: Partial<MindEdge>) => void;
};

export function MindEdgeInspector({
  edge,
  nodes,
  onDeleteEdge,
  onSmartPrompt,
  onUpdateEdge,
}: Props) {
  const t = useTranslations('mind');
  const source = nodes.find((node) => node.id === edge.sourceNodeId);
  const target = nodes.find((node) => node.id === edge.targetNodeId);

  return (
    <section className="space-y-3 p-3">
      <InspectorHeader
        badge={t(`edgeTypes.${edge.edgeType}`)}
        title={t('inspector.edge')}
        onDelete={() => onDeleteEdge(edge.id)}
      />
      <div className="grid gap-1.5 rounded-lg border border-border bg-muted/30 p-2 text-xs">
        <RelationshipEndpoint
          fallback={t('untitledIdea')}
          label={t('fields.source')}
          title={source?.title}
        />
        <RelationshipEndpoint
          fallback={t('untitledIdea')}
          label={t('fields.target')}
          title={target?.title}
        />
      </div>
      {onSmartPrompt ? (
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            className="h-8 justify-start gap-1.5 px-2 text-xs"
            onClick={() =>
              onSmartPrompt(
                t('smartPrompts.refineEdge', {
                  edgeId: edge.id,
                  edgeType: edge.edgeType,
                  label: edge.label ?? '',
                  source: source?.title ?? edge.sourceNodeId,
                  sourceId: edge.sourceNodeId,
                  target: target?.title ?? edge.targetNodeId,
                  targetId: edge.targetNodeId,
                })
              )
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <GitMerge className="h-3.5 w-3.5" />
            <span className="truncate">{t('smartActions.refineEdge')}</span>
          </Button>
          <Button
            className="h-8 justify-start gap-1.5 px-2 text-xs"
            onClick={() =>
              onSmartPrompt(
                t('smartPrompts.rewireEdge', {
                  edgeId: edge.id,
                  edgeType: edge.edgeType,
                  label: edge.label ?? '',
                  source: source?.title ?? edge.sourceNodeId,
                  sourceId: edge.sourceNodeId,
                  target: target?.title ?? edge.targetNodeId,
                  targetId: edge.targetNodeId,
                })
              )
            }
            size="sm"
            type="button"
            variant="secondary"
          >
            <Route className="h-3.5 w-3.5" />
            <span className="truncate">{t('smartActions.rewire')}</span>
          </Button>
        </div>
      ) : null}
      <Field label={t('fields.label')}>
        <Input
          onChange={(event) =>
            onUpdateEdge(edge.id, { label: event.target.value || null })
          }
          value={edge.label ?? ''}
        />
      </Field>
      <Field label={t('fields.type')}>
        <Select
          onValueChange={(value) =>
            onUpdateEdge(edge.id, { edgeType: value as MindEdge['edgeType'] })
          }
          value={edge.edgeType}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MIND_EDGE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`edgeTypes.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <ColorPicker
        color={edge.color}
        onChange={(color) => onUpdateEdge(edge.id, { color })}
      />
    </section>
  );
}

function RelationshipEndpoint({
  label,
  fallback,
  title,
}: {
  fallback: string;
  label: string;
  title?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Badge className="shrink-0 text-[10px]" variant="outline">
        {label}
      </Badge>
      <span className="min-w-0 truncate font-medium">{title || fallback}</span>
    </div>
  );
}

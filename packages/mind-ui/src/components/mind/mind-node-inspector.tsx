'use client';

import {
  GitMerge,
  Lightbulb,
  ListChecks,
  Route,
  SearchCheck,
} from '@tuturuuu/icons';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { ColorPicker, Field, InspectorHeader } from './mind-inspector-shared';
import {
  getNodeMetadata,
  MIND_HORIZONS,
  MIND_NODE_STATUSES,
  MIND_NODE_TYPES,
  NODE_STATUS_COLORS,
  parseTags,
} from './model';

type Props = {
  edges: MindEdge[];
  node: MindNode;
  nodes: MindNode[];
  onDeleteNode: (nodeId: string) => void;
  onSmartPrompt?: (prompt: string) => void;
  onUpdateNode: (nodeId: string, patch: Partial<MindNode>) => void;
};

export function MindNodeInspector({
  node,
  edges,
  nodes,
  onDeleteNode,
  onSmartPrompt,
  onUpdateNode,
}: Props) {
  const t = useTranslations('mind');
  const metadata = getNodeMetadata(node);
  const statusColor = NODE_STATUS_COLORS[node.status];

  return (
    <section className="space-y-3 p-3">
      <InspectorHeader
        badge={t(`nodeStatuses.${node.status}`)}
        title={t('inspector.node')}
        onDelete={() => onDeleteNode(node.id)}
      />
      <div className="flex flex-wrap gap-1.5">
        <Badge className="gap-1" variant="secondary">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          {t(`nodeStatuses.${node.status}`)}
        </Badge>
        <Badge variant="outline">{t(`nodeTypes.${node.nodeType}`)}</Badge>
        <Badge variant="outline">{t(`horizons.${node.horizon}`)}</Badge>
      </div>
      {onSmartPrompt ? (
        <NodeSmartActions
          edges={edges}
          node={node}
          nodes={nodes}
          onSmartPrompt={onSmartPrompt}
        />
      ) : null}
      <Field label={t('fields.title')}>
        <Input
          onChange={(event) =>
            onUpdateNode(node.id, { title: event.target.value })
          }
          value={node.title}
        />
      </Field>
      <Field label={t('fields.body')}>
        <Textarea
          className="min-h-28 resize-none"
          onChange={(event) =>
            onUpdateNode(node.id, { body: event.target.value || null })
          }
          value={node.body ?? ''}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <NodeSelect
          label={t('fields.type')}
          onChange={(value) =>
            onUpdateNode(node.id, { nodeType: value as MindNode['nodeType'] })
          }
          options={MIND_NODE_TYPES.map((type) => ({
            label: t(`nodeTypes.${type}`),
            value: type,
          }))}
          value={node.nodeType}
        />
        <NodeSelect
          label={t('fields.horizon')}
          onChange={(value) =>
            onUpdateNode(node.id, { horizon: value as MindNode['horizon'] })
          }
          options={MIND_HORIZONS.map((horizon) => ({
            label: t(`horizons.${horizon}`),
            value: horizon,
          }))}
          value={node.horizon}
        />
      </div>
      <NodeSelect
        label={t('fields.status')}
        onChange={(value) =>
          onUpdateNode(node.id, { status: value as MindNode['status'] })
        }
        options={MIND_NODE_STATUSES.map((status) => ({
          label: t(`nodeStatuses.${status}`),
          value: status,
        }))}
        value={node.status}
      />
      <NodeSelect
        label={t('fields.parent')}
        onChange={(value) =>
          onUpdateNode(node.id, {
            parentNodeId: value === 'none' ? null : value,
          })
        }
        options={[
          { label: t('none'), value: 'none' },
          ...nodes
            .filter((candidate) => candidate.id !== node.id)
            .map((candidate) => ({
              label: candidate.title,
              value: candidate.id,
            })),
        ]}
        value={node.parentNodeId ?? 'none'}
      />
      <Field label={t('fields.tags')}>
        <Input
          onChange={(event) =>
            onUpdateNode(node.id, {
              metadata: {
                ...node.metadata,
                group: metadata.group || undefined,
                tags: parseTags(event.target.value),
              },
            })
          }
          placeholder={t('placeholders.tags')}
          value={metadata.tags.join(', ')}
        />
      </Field>
      <Field label={t('fields.group')}>
        <Input
          onChange={(event) =>
            onUpdateNode(node.id, {
              metadata: {
                ...node.metadata,
                group: event.target.value || undefined,
                tags: metadata.tags,
              },
            })
          }
          value={metadata.group}
        />
      </Field>
      <ColorPicker
        color={node.color}
        onChange={(color) => onUpdateNode(node.id, { color })}
      />
    </section>
  );
}

function NodeSmartActions({
  edges,
  node,
  nodes,
  onSmartPrompt,
}: {
  edges: MindEdge[];
  node: MindNode;
  nodes: MindNode[];
  onSmartPrompt: (prompt: string) => void;
}) {
  const t = useTranslations('mind');
  const incoming = edges.filter((edge) => edge.targetNodeId === node.id);
  const outgoing = edges.filter((edge) => edge.sourceNodeId === node.id);
  const relatedNodeNames = [
    ...incoming.map(
      (edge) => nodes.find((item) => item.id === edge.sourceNodeId)?.title
    ),
    ...outgoing.map(
      (edge) => nodes.find((item) => item.id === edge.targetNodeId)?.title
    ),
  ]
    .filter(Boolean)
    .join(', ');
  const actions = [
    {
      icon: Route,
      label: t('smartActions.elaborate'),
      prompt: t('smartPrompts.elaborate', {
        body: node.body ?? '',
        horizon: node.horizon,
        id: node.id,
        status: node.status,
        title: node.title,
      }),
    },
    {
      icon: ListChecks,
      label: t('smartActions.actions'),
      prompt: t('smartPrompts.actions', {
        body: node.body ?? '',
        horizon: node.horizon,
        id: node.id,
        status: node.status,
        title: node.title,
      }),
    },
    {
      icon: SearchCheck,
      label: t('smartActions.risks'),
      prompt: t('smartPrompts.risks', {
        body: node.body ?? '',
        horizon: node.horizon,
        id: node.id,
        status: node.status,
        title: node.title,
      }),
    },
    {
      icon: GitMerge,
      label: t('smartActions.refine'),
      prompt: t('smartPrompts.refine', {
        body: node.body ?? '',
        horizon: node.horizon,
        id: node.id,
        status: node.status,
        title: node.title,
      }),
    },
    {
      icon: Route,
      label: t('smartActions.relationships'),
      prompt: t('smartPrompts.relationships', {
        body: node.body ?? '',
        horizon: node.horizon,
        id: node.id,
        incoming: incoming.length,
        outgoing: outgoing.length,
        related: relatedNodeNames || t('none'),
        status: node.status,
        title: node.title,
      }),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-border bg-muted/30 p-2 text-center text-xs">
        <div>
          <p className="font-semibold">{incoming.length}</p>
          <p className="text-muted-foreground">{t('relationships.in')}</p>
        </div>
        <div>
          <p className="font-semibold">{outgoing.length}</p>
          <p className="text-muted-foreground">{t('relationships.out')}</p>
        </div>
        <div>
          <p className="font-semibold">
            {nodes.filter((item) => item.parentNodeId === node.id).length}
          </p>
          <p className="text-muted-foreground">{t('relationships.children')}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              className="h-8 justify-start gap-1.5 px-2 text-xs"
              key={action.label}
              onClick={() => onSmartPrompt(action.prompt)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="truncate">{action.label}</span>
            </Button>
          );
        })}
        <Button
          className="col-span-2 h-8 justify-start gap-1.5 px-2 text-xs"
          onClick={() =>
            onSmartPrompt(
              t('smartPrompts.expandSystem', {
                body: node.body ?? '',
                horizon: node.horizon,
                id: node.id,
                status: node.status,
                title: node.title,
              })
            )
          }
          size="sm"
          type="button"
          variant="secondary"
        >
          <Lightbulb className="h-3.5 w-3.5" />
          <span className="truncate">{t('smartActions.expandSystem')}</span>
        </Button>
      </div>
    </div>
  );
}

function NodeSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <Field label={label}>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

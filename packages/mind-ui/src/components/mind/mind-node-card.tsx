'use client';

import type { MindNode } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';
import { getNodeMetadata, NODE_STATUS_COLORS } from './model';

export type MindFlowNodeData = Record<string, unknown> & {
  dimmed?: boolean;
  node: MindNode;
};

export const MindNodeCard = memo(function MindNodeCard({
  data,
  selected,
}: NodeProps) {
  const t = useTranslations('mind');
  const node = (data as MindFlowNodeData).node;
  const dimmed = (data as MindFlowNodeData).dimmed === true && !selected;
  const metadata = getNodeMetadata(node);
  const color = node.color ?? '#2f80ed';
  const statusColor = NODE_STATUS_COLORS[node.status];

  return (
    <article
      className={cn(
        'group min-h-28 w-64 overflow-hidden rounded-md border bg-card shadow-lg transition',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
        dimmed && 'opacity-30'
      )}
    >
      <MindHandle id="connection-top" position={Position.Top} />
      <MindHandle id="connection-left" position={Position.Left} />
      <MindHandle id="connection-right" position={Position.Right} />
      <div
        className="h-2"
        style={{
          backgroundColor: color,
        }}
      />
      <div className="space-y-3 p-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <h3 className="line-clamp-2 font-semibold text-sm tracking-normal">
              {node.title || t('untitledIdea')}
            </h3>
          </div>
          {node.body ? (
            <p className="mt-2 line-clamp-3 text-muted-foreground text-xs leading-5">
              {node.body}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge className="text-[10px]" variant="secondary">
            {t(`nodeTypes.${node.nodeType}`)}
          </Badge>
          <Badge className="gap-1 text-[10px]" variant="outline">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: statusColor }}
            />
            {t(`nodeStatuses.${node.status}`)}
          </Badge>
          <Badge className="text-[10px]" variant="outline">
            {t(`horizons.${node.horizon}`)}
          </Badge>
          {metadata.group ? (
            <Badge className="text-[10px]" variant="outline">
              {metadata.group}
            </Badge>
          ) : null}
        </div>
        {metadata.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {metadata.tags.slice(0, 4).map((tag) => (
              <span
                className="rounded-full bg-dynamic-green/10 px-2 py-0.5 text-[10px] text-dynamic-green"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <MindHandle id="connection-bottom" position={Position.Bottom} />
    </article>
  );
});

function MindHandle({ id, position }: { id: string; position: Position }) {
  return (
    <Handle
      className={cn(
        'h-2.5 w-2.5 border-2 border-background bg-dynamic-green opacity-70 transition group-hover:opacity-100'
      )}
      id={id}
      position={position}
      type="source"
    />
  );
}

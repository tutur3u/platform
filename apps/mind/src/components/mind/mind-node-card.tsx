'use client';

import type { MindNode } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { getNodeMetadata, NODE_STATUS_COLORS } from './model';

export type MindFlowNodeData = Record<string, unknown> & {
  node: MindNode;
};

export function MindNodeCard({ data, selected }: NodeProps) {
  const t = useTranslations('mind');
  const node = (data as MindFlowNodeData).node;
  const metadata = getNodeMetadata(node);
  const color = node.color ?? '#2f80ed';
  const statusColor = NODE_STATUS_COLORS[node.status];

  return (
    <article
      className={cn(
        'group min-h-28 w-64 overflow-hidden rounded-md border bg-card shadow-lg transition',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
      )}
    >
      <MindHandle id="target-top" position={Position.Top} type="target" />
      <MindHandle id="source-top" position={Position.Top} type="source" />
      <MindHandle id="target-left" position={Position.Left} type="target" />
      <MindHandle id="source-left" position={Position.Left} type="source" />
      <MindHandle id="target-right" position={Position.Right} type="target" />
      <MindHandle id="source-right" position={Position.Right} type="source" />
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
      <MindHandle id="target-bottom" position={Position.Bottom} type="target" />
      <MindHandle id="source-bottom" position={Position.Bottom} type="source" />
    </article>
  );
}

function MindHandle({
  id,
  position,
  type,
}: {
  id: string;
  position: Position;
  type: 'source' | 'target';
}) {
  return (
    <Handle
      className={cn(
        'h-2.5 w-2.5 border-2 border-background opacity-70 transition group-hover:opacity-100',
        type === 'source' ? 'bg-dynamic-green' : 'bg-dynamic-blue'
      )}
      id={id}
      position={position}
      style={getHandleOffset(position, type)}
      type={type}
    />
  );
}

function getHandleOffset(position: Position, type: 'source' | 'target') {
  const offset = type === 'source' ? 8 : -8;
  if (position === Position.Top || position === Position.Bottom) {
    return { left: `calc(50% + ${offset}px)` };
  }

  return { top: `calc(50% + ${offset}px)` };
}

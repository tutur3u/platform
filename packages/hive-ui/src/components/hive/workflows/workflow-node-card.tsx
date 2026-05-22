'use client';

import type { HiveWorkflowNode } from '@tuturuuu/internal-api/hive';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { workflowCatalog } from './workflow-catalog';

type WorkflowNodeData = HiveWorkflowNode['data'];

export function WorkflowNodeCard({ data, selected, type }: NodeProps) {
  const item = workflowCatalog.find((entry) => entry.type === type);
  const Icon = item?.icon;

  return (
    <div
      className={[
        'min-w-44 rounded-lg border bg-background/94 p-3 shadow-foreground/10 shadow-lg backdrop-blur',
        selected
          ? 'border-dynamic-green ring-2 ring-dynamic-green/30'
          : 'border-border/80',
      ].join(' ')}
    >
      <Handle
        className="!h-3 !w-3 !border-background !bg-dynamic-green"
        position={Position.Left}
        type="target"
      />
      <div className="flex items-center gap-2">
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground text-sm">
            {(data as WorkflowNodeData).label}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{type}</p>
        </div>
      </div>
      <Handle
        className="!h-3 !w-3 !border-background !bg-dynamic-green"
        position={Position.Right}
        type="source"
      />
    </div>
  );
}

'use client';

import type { HiveWorkflowNodeType } from '@tuturuuu/internal-api/hive';
import { toast } from '@tuturuuu/ui/sonner';
import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useHiveWorkflowMutations,
  useHiveWorkflowRuns,
  useHiveWorkflows,
} from '@/hooks/use-hive-data';
import { isBoolean, useHivePersistedState } from '../use-hive-persisted-state';
import {
  createWorkflowTemplate,
  type WorkflowTemplateKey,
  workflowCatalog,
} from './workflow-catalog';
import {
  fromDefinitionEdges,
  fromDefinitionNodes,
  isValidWorkflowConnection,
  toDefinition,
  toWorkflowNode,
  validateDraftDefinition,
  type WorkflowFlowNode,
} from './workflow-graph-utils';
import { WorkflowInspector } from './workflow-inspector';
import { WorkflowNodeCard } from './workflow-node-card';
import { WorkflowPalette } from './workflow-palette';
import { WorkflowRunPanel } from './workflow-run-panel';
import { NEW_WORKFLOW_ID, WorkflowTopBar } from './workflow-top-bar';

type HiveWorkflowStudioProps = {
  isAdmin: boolean;
  onExitWorkflows: () => void;
  serverId: string | null;
  serverPicker: ReactNode;
};

const nodeTypes = Object.fromEntries(
  workflowCatalog.map((item) => [item.type, WorkflowNodeCard])
);

export function HiveWorkflowStudio(props: HiveWorkflowStudioProps) {
  return (
    <ReactFlowProvider>
      <HiveWorkflowStudioInner {...props} />
    </ReactFlowProvider>
  );
}

function HiveWorkflowStudioInner({
  isAdmin,
  onExitWorkflows,
  serverId,
  serverPicker,
}: HiveWorkflowStudioProps) {
  const t = useTranslations('studio.workflows');
  const { screenToFlowPosition } = useReactFlow();
  const workflowsQuery = useHiveWorkflows(serverId, true);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null
  );
  const firstWorkflow = workflowsQuery.data?.workflows[0] ?? null;
  const selectedWorkflow =
    selectedWorkflowId && selectedWorkflowId !== NEW_WORKFLOW_ID
      ? (workflowsQuery.data?.workflows.find(
          (workflow) => workflow.id === selectedWorkflowId
        ) ?? null)
      : null;
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState(
    t('templates.simulation_tick.name')
  );
  const [draftDescription, setDraftDescription] = useState('');
  const [leftCollapsed, setLeftCollapsed] = useHivePersistedState(
    'hive.workflow.leftCollapsed',
    false,
    { validate: isBoolean }
  );
  const [rightCollapsed, setRightCollapsed] = useHivePersistedState(
    'hive.workflow.rightCollapsed',
    false,
    { validate: isBoolean }
  );
  const [traceCollapsed, setTraceCollapsed] = useHivePersistedState(
    'hive.workflow.traceCollapsed',
    false,
    { validate: isBoolean }
  );
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const mutations = useHiveWorkflowMutations(
    serverId,
    selectedWorkflow?.id ?? null
  );
  const runsQuery = useHiveWorkflowRuns(
    serverId,
    selectedWorkflow?.id ?? null,
    !!selectedWorkflow
  );
  const latestRun = mutations.runWorkflow.data?.run ?? null;
  const activeRun = latestRun ?? runsQuery.data?.runs[0] ?? null;
  const validationErrors = useMemo(
    () =>
      validateDraftDefinition(toDefinition(nodes, edges), {
        cycle: t('validation.cycle'),
        danglingEdge: t('validation.dangling_edge'),
        edgeLimit: t('validation.edge_limit'),
        missingTrigger: t('validation.missing_trigger'),
        nodeLimit: t('validation.node_limit'),
      }),
    [nodes, edges, t]
  );

  useEffect(() => {
    if (!selectedWorkflowId && firstWorkflow?.id) {
      setSelectedWorkflowId(firstWorkflow.id);
    }
  }, [firstWorkflow?.id, selectedWorkflowId]);

  useEffect(() => {
    const definition =
      selectedWorkflow?.definition ??
      createWorkflowTemplate('simulation_tick', (key) => t(key));
    setNodes(fromDefinitionNodes(definition));
    setEdges(fromDefinitionEdges(definition));
    setDraftName(selectedWorkflow?.name ?? t('templates.simulation_tick.name'));
    setDraftDescription(selectedWorkflow?.description ?? '');
    setSelectedNodeId(null);
  }, [selectedWorkflow, setEdges, setNodes, t]);

  const addNode = useCallback(
    (type: HiveWorkflowNodeType, position = { x: 120, y: 120 }) => {
      if (!isAdmin) return;
      const catalogItem = workflowCatalog.find((item) => item.type === type);
      const node: WorkflowFlowNode = {
        data: {
          config: catalogItem?.defaultConfig ?? {},
          label: t(`nodes.${catalogItem?.labelKey ?? type}`),
        },
        id: `${type}-${Date.now()}`,
        position,
        type,
      };
      setNodes((current) => [...current, node]);
      setSelectedNodeId(node.id);
    },
    [isAdmin, setNodes, t]
  );

  const useTemplate = useCallback(
    (template: WorkflowTemplateKey) => {
      if (!isAdmin) return;
      const definition = createWorkflowTemplate(template, (key) => t(key));
      setNodes(fromDefinitionNodes(definition));
      setEdges(fromDefinitionEdges(definition));
      setDraftName(t(`templates.${template}.name`));
      setDraftDescription(t(`templates.${template}.description`));
      setSelectedWorkflowId(NEW_WORKFLOW_ID);
      setSelectedNodeId(null);
    },
    [isAdmin, setEdges, setNodes, t]
  );

  const saveWorkflow = () => {
    if (!serverId || !isAdmin || validationErrors.length > 0) return;
    const payload = {
      definition: toDefinition(nodes, edges),
      description: draftDescription || null,
      enabled: true,
      name: draftName.trim() || t('untitled'),
    };

    if (selectedWorkflow) {
      mutations.updateWorkflow.mutate(
        { payload, targetWorkflowId: selectedWorkflow.id },
        { onSuccess: () => toast.success(t('saved')) }
      );
      return;
    }

    mutations.createWorkflow.mutate(payload, {
      onSuccess: ({ workflow }) => {
        setSelectedWorkflowId(workflow.id);
        toast.success(t('saved'));
      },
    });
  };

  const runWorkflow = () => {
    if (!selectedWorkflow || !serverId) return;
    mutations.runWorkflow.mutate(
      { input: { source: 'hive-workflow-studio' } },
      { onSuccess: () => toast.success(t('run_started')) }
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <WorkflowTopBar
        activeRun={activeRun}
        draftDescription={draftDescription}
        draftName={draftName}
        isAdmin={isAdmin}
        leftCollapsed={leftCollapsed}
        onChangeDescription={setDraftDescription}
        onChangeName={setDraftName}
        onExitWorkflows={onExitWorkflows}
        onRunWorkflow={runWorkflow}
        onSaveWorkflow={saveWorkflow}
        onSelectWorkflow={setSelectedWorkflowId}
        onToggleInspector={() => setRightCollapsed((value) => !value)}
        onTogglePalette={() => setLeftCollapsed((value) => !value)}
        onToggleTrace={() => setTraceCollapsed((value) => !value)}
        rightCollapsed={rightCollapsed}
        runPending={mutations.runWorkflow.isPending}
        selectedWorkflow={selectedWorkflow}
        serverPicker={serverPicker}
        traceCollapsed={traceCollapsed}
        validationErrors={validationErrors}
        workflows={workflowsQuery.data?.workflows ?? []}
      />
      <div
        className="grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
        style={{
          gridTemplateColumns: `${
            leftCollapsed ? '0px' : 'minmax(248px, 300px)'
          } minmax(0, 1fr) ${rightCollapsed ? '0px' : 'minmax(280px, 340px)'}`,
        }}
      >
        <div
          aria-hidden={leftCollapsed}
          className={[
            'min-h-0 min-w-0 overflow-hidden border-border/70 transition-[opacity,transform] duration-300 ease-out',
            leftCollapsed
              ? 'pointer-events-none -translate-x-2 border-r-0 opacity-0'
              : 'translate-x-0 border-r opacity-100',
          ].join(' ')}
        >
          <WorkflowPalette
            isAdmin={isAdmin}
            onAddNode={(type) => addNode(type)}
            onUseTemplate={useTemplate}
          />
        </div>
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="min-h-0 flex-1">
            <ReactFlow
              colorMode="dark"
              edges={edges}
              fitView
              nodeTypes={nodeTypes}
              nodes={nodes}
              nodesDraggable={isAdmin}
              onConnect={(connection: Connection) => {
                if (
                  !isAdmin ||
                  !isValidWorkflowConnection(connection, nodes, edges)
                ) {
                  return;
                }
                setEdges((current) =>
                  addEdge(
                    {
                      ...connection,
                      id: `${connection.source}-${connection.target}-${Date.now()}`,
                    },
                    current
                  )
                );
              }}
              onDragOver={(event) => {
                if (!isAdmin) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                if (!isAdmin) return;
                event.preventDefault();
                const type = event.dataTransfer.getData(
                  'application/hive-node-type'
                ) as HiveWorkflowNodeType;
                if (!type) return;
                addNode(
                  type,
                  screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                  })
                );
              }}
              onEdgesChange={isAdmin ? onEdgesChange : undefined}
              isValidConnection={(connection) =>
                isAdmin && isValidWorkflowConnection(connection, nodes, edges)
              }
              onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
              onNodesChange={isAdmin ? onNodesChange : undefined}
              snapGrid={[16, 16]}
              snapToGrid
            >
              <Background gap={24} />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>
          </div>
          <div
            aria-hidden={traceCollapsed}
            className={[
              'overflow-hidden transition-[height,opacity,transform] duration-300 ease-out',
              traceCollapsed
                ? 'h-0 translate-y-2 opacity-0'
                : 'h-44 translate-y-0 opacity-100',
            ].join(' ')}
          >
            <WorkflowRunPanel
              latestRun={latestRun}
              runs={runsQuery.data?.runs ?? []}
            />
          </div>
        </section>
        <div
          aria-hidden={rightCollapsed}
          className={[
            'min-h-0 min-w-0 overflow-hidden border-border/70 transition-[opacity,transform] duration-300 ease-out',
            rightCollapsed
              ? 'pointer-events-none translate-x-2 border-l-0 opacity-0'
              : 'translate-x-0 border-l opacity-100',
          ].join(' ')}
        >
          <WorkflowInspector
            isAdmin={isAdmin}
            node={selectedNode ? toWorkflowNode(selectedNode) : null}
            onChange={(nodeId, patch) => {
              if (!isAdmin) return;
              setNodes((current) =>
                current.map((node) =>
                  node.id === nodeId ? { ...node, ...patch } : node
                )
              );
            }}
            onDelete={(nodeId) => {
              if (!isAdmin) return;
              setNodes((current) =>
                current.filter((node) => node.id !== nodeId)
              );
              setEdges((current) =>
                current.filter(
                  (edge) => edge.source !== nodeId && edge.target !== nodeId
                )
              );
              setSelectedNodeId(null);
            }}
            validationErrors={validationErrors}
          />
        </div>
      </div>
    </div>
  );
}

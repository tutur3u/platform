'use client';

import { Map as MapIcon, Play, Save, Workflow } from '@tuturuuu/icons';
import type {
  HiveWorkflowDefinition,
  HiveWorkflowNode,
  HiveWorkflowNodeType,
} from '@tuturuuu/internal-api/hive';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
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
import {
  createWorkflowTemplate,
  type WorkflowTemplateKey,
  workflowCatalog,
} from './workflow-catalog';
import { WorkflowInspector } from './workflow-inspector';
import { WorkflowNodeCard } from './workflow-node-card';
import { WorkflowPalette } from './workflow-palette';
import { WorkflowRunPanel } from './workflow-run-panel';

type WorkflowFlowNode = Node<HiveWorkflowNode['data'], HiveWorkflowNodeType>;

type HiveWorkflowStudioProps = {
  isAdmin: boolean;
  onExitWorkflows: () => void;
  serverId: string | null;
  serverPicker: ReactNode;
};

const NEW_WORKFLOW_ID = '__new__';

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
      <header className="group/hive-top-toolbar flex shrink-0 items-center gap-3 border-border/70 border-b bg-background/95 px-4 py-3 backdrop-blur-xl">
        <Button
          aria-label={t('chrome.back_to_world')}
          className="h-10 w-10 shrink-0 border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/15"
          onClick={onExitWorkflows}
          size="icon"
          type="button"
          variant="outline"
        >
          <MapIcon className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="font-medium text-dynamic-green text-xs uppercase tracking-wide">
            {t('chrome.eyebrow')}
          </p>
          <h1 className="truncate font-semibold text-base">
            {t('chrome.title')}
          </h1>
          <p className="truncate text-muted-foreground text-xs">
            {t('chrome.subtitle')}
          </p>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {serverPicker}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(300px,380px)] overflow-hidden">
        <WorkflowPalette
          isAdmin={isAdmin}
          onAddNode={(type) => addNode(type)}
          onUseTemplate={useTemplate}
        />
        <section className="flex min-h-0 min-w-0 flex-col border-border/70 border-r">
          <header className="flex shrink-0 flex-wrap items-center gap-3 border-border/70 border-b bg-background/92 p-3 backdrop-blur-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green">
              <Workflow className="h-5 w-5" />
            </div>
            <div className="min-w-56 flex-1">
              <Input
                aria-label={t('name')}
                className="h-9 border-transparent bg-transparent px-0 font-semibold text-base shadow-none"
                disabled={!isAdmin}
                onChange={(event) => setDraftName(event.target.value)}
                value={draftName}
              />
              <Input
                aria-label={t('description')}
                className="h-7 border-transparent bg-transparent px-0 text-muted-foreground text-xs shadow-none"
                disabled={!isAdmin}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder={t('description')}
                value={draftDescription}
              />
            </div>
            <select
              aria-label={t('select_workflow')}
              className="h-9 max-w-52 rounded-md border border-border bg-background px-2 text-sm"
              onChange={(event) => setSelectedWorkflowId(event.target.value)}
              value={selectedWorkflow?.id ?? NEW_WORKFLOW_ID}
            >
              <option value={NEW_WORKFLOW_ID}>{t('new_workflow')}</option>
              {(workflowsQuery.data?.workflows ?? []).map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
            <Button
              disabled={!isAdmin || validationErrors.length > 0}
              onClick={saveWorkflow}
              type="button"
            >
              <Save className="mr-2 h-4 w-4" />
              {t('save')}
            </Button>
            <Button
              disabled={!selectedWorkflow || mutations.runWorkflow.isPending}
              onClick={runWorkflow}
              type="button"
              variant="secondary"
            >
              <Play className="mr-2 h-4 w-4" />
              {mutations.runWorkflow.isPending ? t('running') : t('run')}
            </Button>
          </header>
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
          <WorkflowRunPanel
            latestRun={latestRun}
            runs={runsQuery.data?.runs ?? []}
          />
        </section>
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
            setNodes((current) => current.filter((node) => node.id !== nodeId));
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
  );
}

function fromDefinitionNodes(
  definition: HiveWorkflowDefinition
): WorkflowFlowNode[] {
  return definition.nodes.map((node) => ({
    ...node,
    type: node.type,
  }));
}

function fromDefinitionEdges(definition: HiveWorkflowDefinition): Edge[] {
  return definition.edges.map((edge) => ({ ...edge }));
}

function toWorkflowNode(node: WorkflowFlowNode): HiveWorkflowNode {
  return {
    data: node.data,
    id: node.id,
    position: node.position,
    type: node.type as HiveWorkflowNodeType,
  };
}

function toDefinition(
  nodes: WorkflowFlowNode[],
  edges: Edge[]
): HiveWorkflowDefinition {
  return {
    edges: edges.map((edge) => ({
      id: edge.id,
      label: typeof edge.label === 'string' ? edge.label : undefined,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    })),
    nodes: nodes.map(toWorkflowNode),
    version: 1,
  };
}

function validateDraftDefinition(
  definition: HiveWorkflowDefinition,
  messages: {
    cycle: string;
    danglingEdge: string;
    edgeLimit: string;
    missingTrigger: string;
    nodeLimit: string;
  }
) {
  const errors: string[] = [];
  const nodeIds = new Set(definition.nodes.map((node) => node.id));

  if (!definition.nodes.some((node) => node.type === 'manual_trigger')) {
    errors.push(messages.missingTrigger);
  }
  if (definition.nodes.length > 80) {
    errors.push(messages.nodeLimit);
  }
  if (definition.edges.length > 120) {
    errors.push(messages.edgeLimit);
  }
  if (
    definition.edges.some(
      (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
    )
  ) {
    errors.push(messages.danglingEdge);
  }
  if (hasDraftCycle(definition)) {
    errors.push(messages.cycle);
  }
  return errors;
}

function isValidWorkflowConnection(
  connection: Connection | Edge,
  nodes: WorkflowFlowNode[],
  edges: Edge[]
) {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;
  const sourceHandle = connection.sourceHandle ?? null;
  const targetHandle = connection.targetHandle ?? null;

  if (
    edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        (edge.sourceHandle ?? null) === sourceHandle
    )
  ) {
    return false;
  }

  return !hasDraftCycle(
    toDefinition(nodes, [
      ...edges,
      {
        id: '__candidate__',
        source: connection.source,
        sourceHandle,
        target: connection.target,
        targetHandle,
      },
    ])
  );
}

function hasDraftCycle(definition: HiveWorkflowDefinition) {
  const outgoing = new Map<string, string[]>();
  for (const edge of definition.edges) {
    const current = outgoing.get(edge.source) ?? [];
    current.push(edge.target);
    outgoing.set(edge.source, current);
  }

  const state = new Map<string, 'done' | 'visiting'>();
  const visit = (nodeId: string): boolean => {
    const current = state.get(nodeId);
    if (current === 'visiting') return true;
    if (current === 'done') return false;

    state.set(nodeId, 'visiting');
    for (const target of outgoing.get(nodeId) ?? []) {
      if (visit(target)) return true;
    }
    state.set(nodeId, 'done');
    return false;
  };

  return definition.nodes.some((node) => visit(node.id));
}

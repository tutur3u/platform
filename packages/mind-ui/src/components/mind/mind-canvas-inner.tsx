'use client';

import type { MindBoardSnapshot, MindEdge, MindNode } from '@tuturuuu/types/db';
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  formatMindBoardAsJson,
  formatMindBoardAsMarkdown,
} from './mind-board-export';
import { MindCanvasGraph } from './mind-canvas-graph';
import { MindCanvasInspectorPanel } from './mind-canvas-inspector-panel';
import { MindCanvasToolbar } from './mind-canvas-toolbar';
import {
  createMindEdge,
  createMindNode,
  getMindGroupFrames,
  getVisibleFlowEdges,
  getVisibleFlowNodes,
  type MindFlowEdge,
  type MindFlowNode,
  organizeMindLayout,
  toFlowEdge,
  toFlowEdges,
  toFlowNode,
  toFlowNodes,
  toSaveMindGraphPayload,
} from './mind-flow';

export type MindCanvasInnerProps = {
  disabled?: boolean;
  horizon: string;
  onHorizonChange: (value: string) => void;
  onSave: (payload: ReturnType<typeof toSaveMindGraphPayload>) => void;
  onSmartPrompt?: (prompt: string) => void;
  saving?: boolean;
  selectedTags: string[];
  snapshot: MindBoardSnapshot;
};

export function MindCanvasInner({
  disabled,
  horizon,
  onHorizonChange,
  onSave,
  onSmartPrompt,
  saving,
  selectedTags,
  snapshot,
}: MindCanvasInnerProps) {
  const t = useTranslations('mind');
  const [nodes, setNodes] = useState<MindFlowNode[]>(() =>
    toFlowNodes(snapshot.nodes)
  );
  const [edges, setEdges] = useState<MindFlowEdge[]>(() =>
    toFlowEdges(snapshot.edges)
  );
  const [deletedNodeIds, setDeletedNodeIds] = useState<string[]>([]);
  const [deletedEdgeIds, setDeletedEdgeIds] = useState<string[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);

  useEffect(() => {
    setNodes(toFlowNodes(snapshot.nodes));
    setEdges(toFlowEdges(snapshot.edges));
    setDeletedNodeIds([]);
    setDeletedEdgeIds([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setInspectorOpen(false);
  }, [snapshot]);

  const visibleNodes = useMemo(
    () => getVisibleFlowNodes({ horizon, nodes, selectedTags }),
    [horizon, nodes, selectedTags]
  );
  const visibleEdges = useMemo(
    () => getVisibleFlowEdges({ edges, nodes: visibleNodes }),
    [edges, visibleNodes]
  );
  const groupFrames = useMemo(
    () => getMindGroupFrames({ edges: visibleEdges, nodes: visibleNodes }),
    [visibleEdges, visibleNodes]
  );
  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId)?.data.node ?? null;
  const selectedEdge =
    edges.find((edge) => edge.id === selectedEdgeId)?.data?.edge ?? null;

  const updateNode = (nodeId: string, patch: Partial<MindNode>) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? { ...node, data: { node: { ...node.data.node, ...patch } } }
          : node
      )
    );
  };
  const updateEdge = (edgeId: string, patch: Partial<MindEdge>) => {
    setEdges((current) =>
      current.map((edge) => {
        const currentEdge = edge.data?.edge;
        if (edge.id !== edgeId || !currentEdge) return edge;

        return {
          ...edge,
          data: { edge: { ...currentEdge, ...patch } },
          label: patch.label ?? edge.label,
        };
      })
    );
  };

  const addNode = () => {
    const id = crypto.randomUUID();
    const node = createMindNode({
      boardHorizon: snapshot.board.defaultHorizon,
      id,
      title: t('untitledIdea'),
      x: 80 + nodes.length * 28,
      y: 80 + nodes.length * 18,
    });
    setNodes((current) => [...current, toFlowNode(node)]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  };

  const save = () => {
    onSave(
      toSaveMindGraphPayload({ deletedEdgeIds, deletedNodeIds, edges, nodes })
    );
  };

  const organize = () => {
    setNodes((current) => organizeMindLayout({ edges, nodes: current }));
  };

  const getCurrentGraph = () => ({
    edges: edges.flatMap((edge) => (edge.data?.edge ? [edge.data.edge] : [])),
    nodes: nodes.map((node) => ({
      ...node.data.node,
      positionX: node.position.x,
      positionY: node.position.y,
    })),
  });

  const copyBoardJson = async () => {
    const current = getCurrentGraph();
    await navigator.clipboard.writeText(
      formatMindBoardAsJson({ ...current, snapshot })
    );
  };

  const copyBoardMarkdown = async () => {
    const current = getCurrentGraph();
    await navigator.clipboard.writeText(
      formatMindBoardAsMarkdown({ ...current, snapshot })
    );
  };

  const relationshipPass = () => {
    onSmartPrompt?.(
      t('smartPrompts.relationshipPass', {
        board: snapshot.board.title,
        edges: edges.length,
        nodes: nodes.length,
      })
    );
  };

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden">
      <div className="relative h-full min-h-0">
        <MindCanvasToolbar
          collapsed={toolbarCollapsed}
          disabled={disabled}
          horizon={horizon}
          onAddNode={addNode}
          onCollapsedChange={setToolbarCollapsed}
          onCopyJson={copyBoardJson}
          onCopyMarkdown={copyBoardMarkdown}
          onHorizonChange={onHorizonChange}
          onOrganize={organize}
          onRelationshipPass={onSmartPrompt ? relationshipPass : undefined}
          onSave={save}
          saving={saving}
        />
        <MindCanvasGraph
          edges={visibleEdges}
          groupFrames={groupFrames}
          nodes={visibleNodes}
          onCanvasClick={() => setToolbarCollapsed(true)}
          onConnect={(source, target) => {
            const edge = createMindEdge(source, target);
            setEdges((current) => [...current, toFlowEdge(edge)]);
          }}
          onEdgesChange={(changes) =>
            setEdges((current) => applyEdgeChanges(changes, current))
          }
          onEdgesDelete={(deleted) =>
            setDeletedEdgeIds((current) => [
              ...current,
              ...deleted.map((edge) => edge.id),
            ])
          }
          onNodesChange={(changes) =>
            setNodes((current) => applyNodeChanges(changes, current))
          }
          onNodesDelete={(deleted) =>
            setDeletedNodeIds((current) => [
              ...current,
              ...deleted.map((node) => node.id),
            ])
          }
          onSelectionChange={({
            edges: selectedEdges,
            nodes: selectedNodes,
          }) => {
            setSelectedNodeId(selectedNodes[0]?.id ?? null);
            setSelectedEdgeId(selectedEdges[0]?.id ?? null);
            setInspectorOpen(!!selectedNodes[0] || !!selectedEdges[0]);
          }}
        />
      </div>
      {inspectorOpen ? (
        <MindCanvasInspectorPanel
          edge={selectedEdge}
          edges={edges.flatMap((edge) =>
            edge.data?.edge ? [edge.data.edge] : []
          )}
          node={selectedNode}
          nodes={nodes.map((node) => node.data.node)}
          onClose={() => setInspectorOpen(false)}
          onDeleteEdge={(edgeId) => {
            setEdges((current) => current.filter((edge) => edge.id !== edgeId));
            setDeletedEdgeIds((current) => [...current, edgeId]);
            setSelectedEdgeId(null);
            setInspectorOpen(false);
          }}
          onDeleteNode={(nodeId) => {
            setNodes((current) => current.filter((node) => node.id !== nodeId));
            setDeletedNodeIds((current) => [...current, nodeId]);
            setSelectedNodeId(null);
            setInspectorOpen(false);
          }}
          onUpdateEdge={updateEdge}
          onSmartPrompt={onSmartPrompt}
          onUpdateNode={updateNode}
        />
      ) : null}
    </section>
  );
}

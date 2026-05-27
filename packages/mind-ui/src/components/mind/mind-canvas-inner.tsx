'use client';

import { Maximize2, Plus } from '@tuturuuu/icons';
import type { MindBoardSnapshot, MindEdge, MindNode } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  useReactFlow,
} from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MindAutoSaveStatus } from './mind-auto-save-island';
import {
  formatMindBoardAsJson,
  formatMindBoardAsMarkdown,
} from './mind-board-export';
import { MindCanvasGraph } from './mind-canvas-graph';
import { MindCanvasInspectorPanel } from './mind-canvas-inspector-panel';
import { MindCanvasToolbar } from './mind-canvas-toolbar';
import {
  createMindConnectionEdge,
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
import { MindRelatedViewIsland } from './mind-related-view-island';
import { getNodeMetadata } from './model';
import { useDebouncedValue } from './use-debounced-value';

const DERIVED_GRAPH_DEBOUNCE_MS = 120;
const SAVE_SIGNATURE_DEBOUNCE_MS = 350;
const TAG_INDEX_DEBOUNCE_MS = 180;

export type MindCanvasInnerProps = {
  boardActionPending?: boolean;
  disabled?: boolean;
  horizon: string;
  onDeleteBoard?: () => Promise<unknown> | unknown;
  onHorizonChange: (value: string) => void;
  onRenameBoard?: (title: string) => Promise<unknown> | unknown;
  onSave: (
    payload: ReturnType<typeof toSaveMindGraphPayload>
  ) => Promise<unknown> | unknown;
  onSelectedTagsChange: (tags: string[]) => void;
  onSmartPrompt?: (prompt: string) => void;
  saving?: boolean;
  selectedTags: string[];
  snapshot: MindBoardSnapshot;
  snapshotRefreshVersion?: number;
};

export function MindCanvasInner({
  boardActionPending,
  disabled,
  horizon,
  onDeleteBoard,
  onHorizonChange,
  onRenameBoard,
  onSave,
  onSelectedTagsChange,
  onSmartPrompt,
  saving,
  selectedTags,
  snapshot,
  snapshotRefreshVersion = 0,
}: MindCanvasInnerProps) {
  const t = useTranslations('mind');
  const reactFlow = useReactFlow<MindFlowNode, MindFlowEdge>();
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
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [inspectorMinimized, setInspectorMinimized] = useState(false);
  const [relatedViewOpen, setRelatedViewOpen] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] =
    useState<MindAutoSaveStatus>('saved');
  const editVersionRef = useRef(0);
  const hasUnsavedLocalEditsRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const previousSnapshotBoardIdRef = useRef(snapshot.board.id);
  const previousSnapshotRefreshVersionRef = useRef(snapshotRefreshVersion);
  const savePayloadInput = useMemo(
    () => ({ deletedEdgeIds, deletedNodeIds, edges, nodes }),
    [deletedEdgeIds, deletedNodeIds, edges, nodes]
  );
  const debouncedSavePayloadInput = useDebouncedValue(
    savePayloadInput,
    SAVE_SIGNATURE_DEBOUNCE_MS
  );
  const savePayload = useMemo(
    () =>
      toSaveMindGraphPayload({
        deletedEdgeIds: debouncedSavePayloadInput.deletedEdgeIds,
        deletedNodeIds: debouncedSavePayloadInput.deletedNodeIds,
        edges: debouncedSavePayloadInput.edges,
        nodes: debouncedSavePayloadInput.nodes,
      }),
    [debouncedSavePayloadInput]
  );
  const graphSignature = useMemo(
    () => getMindGraphSignature(savePayload),
    [savePayload]
  );
  const [savedGraphSignature, setSavedGraphSignature] =
    useState(graphSignature);
  const latestSaveRef = useRef({
    editVersion: editVersionRef.current,
    graphSignature,
    payload: savePayload,
  });

  useEffect(() => {
    const boardChanged =
      previousSnapshotBoardIdRef.current !== snapshot.board.id;
    const refreshRequested =
      previousSnapshotRefreshVersionRef.current !== snapshotRefreshVersion;
    if (!boardChanged && !refreshRequested && hasUnsavedLocalEditsRef.current) {
      return;
    }

    const nextNodes = toFlowNodes(snapshot.nodes);
    const nextEdges = toFlowEdges(snapshot.edges);
    const nextPayload = toSaveMindGraphPayload({
      deletedEdgeIds: [],
      deletedNodeIds: [],
      edges: nextEdges,
      nodes: nextNodes,
    });
    const nextSignature = getMindGraphSignature(nextPayload);

    previousSnapshotBoardIdRef.current = snapshot.board.id;
    previousSnapshotRefreshVersionRef.current = snapshotRefreshVersion;
    editVersionRef.current = 0;
    hasUnsavedLocalEditsRef.current = false;
    setNodes(nextNodes);
    setEdges(nextEdges);
    setDeletedNodeIds([]);
    setDeletedEdgeIds([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedFrameId(null);
    setInspectorOpen(false);
    setInspectorMinimized(false);
    setRelatedViewOpen(false);
    setSavedGraphSignature(nextSignature);
    setAutoSaveStatus('saved');
  }, [snapshot, snapshotRefreshVersion]);

  useEffect(() => {
    latestSaveRef.current = {
      editVersion: editVersionRef.current,
      graphSignature,
      payload: savePayload,
    };
  }, [graphSignature, savePayload]);

  const markGraphEdited = useCallback(() => {
    editVersionRef.current += 1;
    hasUnsavedLocalEditsRef.current = true;
    setAutoSaveStatus('unsaved');
  }, []);

  const getImmediateSaveState = useCallback(() => {
    const payload = toSaveMindGraphPayload({
      deletedEdgeIds,
      deletedNodeIds,
      edges,
      nodes,
    });

    return {
      editVersion: editVersionRef.current,
      graphSignature: getMindGraphSignature(payload),
      payload,
    };
  }, [deletedEdgeIds, deletedNodeIds, edges, nodes]);

  const saveNow = useCallback(
    async (options?: { flush?: boolean }) => {
      if (saveInFlightRef.current) return;

      const pending = options?.flush
        ? getImmediateSaveState()
        : latestSaveRef.current;
      if (pending.graphSignature === savedGraphSignature) {
        if (options?.flush || !hasUnsavedLocalEditsRef.current) {
          hasUnsavedLocalEditsRef.current = false;
          setAutoSaveStatus('saved');
        } else {
          setAutoSaveStatus('unsaved');
        }
        return;
      }

      saveInFlightRef.current = true;
      setAutoSaveStatus('saving');

      try {
        await onSave(pending.payload);

        if (editVersionRef.current === pending.editVersion) {
          hasUnsavedLocalEditsRef.current = false;
          setDeletedNodeIds([]);
          setDeletedEdgeIds([]);
          setSavedGraphSignature(pending.graphSignature);
          setAutoSaveStatus('saved');
        } else {
          hasUnsavedLocalEditsRef.current = true;
          setAutoSaveStatus('unsaved');
        }
      } catch {
        setAutoSaveStatus('error');
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [getImmediateSaveState, onSave, savedGraphSignature]
  );

  useEffect(() => {
    if (graphSignature === savedGraphSignature) {
      if (!hasUnsavedLocalEditsRef.current && !saving) {
        setAutoSaveStatus('saved');
      }
      return;
    }
    if (!hasUnsavedLocalEditsRef.current) {
      if (!saving) setAutoSaveStatus('saved');
      return;
    }
    if (autoSaveStatus === 'error' || saveInFlightRef.current) return;

    const timeout = window.setTimeout(() => {
      void saveNow();
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [autoSaveStatus, graphSignature, saveNow, savedGraphSignature, saving]);

  const visibleNodes = useMemo(
    () => getVisibleFlowNodes({ horizon, nodes, selectedTags }),
    [horizon, nodes, selectedTags]
  );
  const routingVisibleNodes = useDebouncedValue(
    visibleNodes,
    DERIVED_GRAPH_DEBOUNCE_MS
  );
  const routedVisibleEdges = useMemo(
    () => getVisibleFlowEdges({ edges, nodes: routingVisibleNodes }),
    [edges, routingVisibleNodes]
  );
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes]
  );
  const visibleEdges = useMemo(
    () =>
      routedVisibleEdges.filter(
        (edge) =>
          visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
      ),
    [routedVisibleEdges, visibleNodeIds]
  );
  const groupFrames = useMemo(
    () =>
      getMindGroupFrames({
        edges: visibleEdges,
        nodes: routingVisibleNodes.filter((node) =>
          visibleNodeIds.has(node.id)
        ),
      }),
    [routingVisibleNodes, visibleEdges, visibleNodeIds]
  );
  const tagNodes = useDebouncedValue(nodes, TAG_INDEX_DEBOUNCE_MS);
  const tags = useMemo(() => {
    const values = new Set<string>();
    for (const node of tagNodes) {
      for (const tag of getNodeMetadata(node.data.node).tags) values.add(tag);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [tagNodes]);
  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId)?.data.node ?? null;
  const selectedEdge =
    edges.find((edge) => edge.id === selectedEdgeId)?.data?.edge ?? null;
  const selectedFrame =
    groupFrames.find((frame) => frame.id === selectedFrameId) ?? null;
  const focusNodeInView = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;

      const center = getFlowNodeCenter(node);
      window.requestAnimationFrame(() => {
        void reactFlow.setCenter(center.x, center.y, {
          duration: 300,
          zoom: Math.min(Math.max(reactFlow.getZoom(), 0.85), 1.15),
        });
      });
    },
    [nodes, reactFlow]
  );
  const focusEdgeInView = useCallback(
    (edgeId: string) => {
      const edge = edges.find((item) => item.id === edgeId);
      if (!edge) return;

      const source = nodes.find((item) => item.id === edge.source);
      const target = nodes.find((item) => item.id === edge.target);
      if (!source || !target) return;

      const sourceCenter = getFlowNodeCenter(source);
      const targetCenter = getFlowNodeCenter(target);
      window.requestAnimationFrame(() => {
        void reactFlow.setCenter(
          (sourceCenter.x + targetCenter.x) / 2,
          (sourceCenter.y + targetCenter.y) / 2,
          {
            duration: 300,
            zoom: Math.min(Math.max(reactFlow.getZoom(), 0.75), 1.05),
          }
        );
      });
    },
    [edges, nodes, reactFlow]
  );
  const selectNodeFromRelatedView = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
      setSelectedFrameId(null);
      setInspectorOpen(!inspectorMinimized);
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          selected: node.id === nodeId,
        }))
      );
      setEdges((current) =>
        current.map((edge) =>
          edge.selected ? { ...edge, selected: false } : edge
        )
      );
      focusNodeInView(nodeId);
    },
    [focusNodeInView, inspectorMinimized]
  );
  const selectEdgeFromRelatedView = useCallback(
    (edgeId: string) => {
      setSelectedNodeId(null);
      setSelectedEdgeId(edgeId);
      setSelectedFrameId(null);
      setInspectorOpen(!inspectorMinimized);
      setNodes((current) =>
        current.map((node) =>
          node.selected ? { ...node, selected: false } : node
        )
      );
      setEdges((current) =>
        current.map((edge) => ({
          ...edge,
          selected: edge.id === edgeId,
        }))
      );
      focusEdgeInView(edgeId);
    },
    [focusEdgeInView, inspectorMinimized]
  );

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setInspectorMinimized(false);
    setRelatedViewOpen(false);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedFrameId(null);
    setNodes((current) =>
      current.map((node) =>
        node.selected ? { ...node, selected: false } : node
      )
    );
    setEdges((current) =>
      current.map((edge) =>
        edge.selected ? { ...edge, selected: false } : edge
      )
    );
  }, []);

  const submitInspectorSmartPrompt = useCallback(
    (prompt: string) => {
      closeInspector();
      onSmartPrompt?.(prompt);
    },
    [closeInspector, onSmartPrompt]
  );

  const updateNode = (nodeId: string, patch: Partial<MindNode>) => {
    markGraphEdited();
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? { ...node, data: { node: { ...node.data.node, ...patch } } }
          : node
      )
    );
  };
  const updateEdge = (edgeId: string, patch: Partial<MindEdge>) => {
    markGraphEdited();
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
    markGraphEdited();
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
    setSelectedFrameId(null);
  };

  const organize = () => {
    markGraphEdited();
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
  const selectedTitle =
    selectedNode?.title ||
    selectedEdge?.label ||
    (selectedEdge ? t(`edgeTypes.${selectedEdge.edgeType}`) : null) ||
    selectedFrame?.title ||
    selectedFrame?.parentTitle ||
    null;
  const restoreInspector = () => {
    if (!selectedNode && !selectedEdge && !selectedFrame) return;
    setInspectorOpen(true);
    setInspectorMinimized(false);
  };

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden">
      <div className="relative h-full min-h-0">
        <MindCanvasToolbar
          boardTitle={snapshot.board.title}
          collapsed={toolbarCollapsed}
          deletingBoard={boardActionPending}
          disabled={disabled || boardActionPending}
          horizon={horizon}
          autoSaveStatus={saving ? 'saving' : autoSaveStatus}
          onAddNode={addNode}
          onCollapsedChange={setToolbarCollapsed}
          onCopyJson={copyBoardJson}
          onCopyMarkdown={copyBoardMarkdown}
          onDeleteBoard={onDeleteBoard}
          onHorizonChange={onHorizonChange}
          onOrganize={organize}
          onRenameBoard={onRenameBoard}
          onRelationshipPass={onSmartPrompt ? relationshipPass : undefined}
          onSaveNow={() => void saveNow({ flush: true })}
          onSelectedTagsChange={onSelectedTagsChange}
          renamingBoard={boardActionPending}
          selectedTags={selectedTags}
          tags={tags}
        />
        <MindCanvasGraph
          key={snapshotRefreshVersion}
          edges={visibleEdges}
          groupFrames={groupFrames}
          nodes={visibleNodes}
          onCanvasClick={() => {
            setToolbarCollapsed(true);
            closeInspector();
          }}
          onConnect={(connection) => {
            const edge = createMindConnectionEdge({
              frames: groupFrames,
              source: connection.source,
              target: connection.target,
            });
            if (!edge) return;

            markGraphEdited();
            setEdges((current) => [...current, toFlowEdge(edge)]);
          }}
          onEdgesChange={(changes) => {
            if (hasPersistentEdgeChange(changes)) markGraphEdited();
            setEdges((current) => applyEdgeChanges(changes, current));
          }}
          onEdgesDelete={(deleted) => {
            markGraphEdited();
            setDeletedEdgeIds((current) => [
              ...current,
              ...deleted.map((edge) => edge.id),
            ]);
          }}
          onNodesChange={(changes) => {
            if (hasPersistentNodeChange(changes)) markGraphEdited();
            setNodes((current) => applyNodeChanges(changes, current));
          }}
          onNodesDelete={(deleted) => {
            markGraphEdited();
            setDeletedNodeIds((current) => [
              ...current,
              ...deleted.map((node) => node.id),
            ]);
          }}
          onSelectEdgeLabel={(edgeId) => {
            setSelectedNodeId(null);
            setSelectedEdgeId(edgeId);
            setSelectedFrameId(null);
            setInspectorOpen(true);
            setInspectorMinimized(false);
            setNodes((current) =>
              current.map((node) =>
                node.selected ? { ...node, selected: false } : node
              )
            );
            setEdges((current) =>
              current.map((edge) => ({
                ...edge,
                selected: edge.id === edgeId,
              }))
            );
            focusEdgeInView(edgeId);
          }}
          selectedEdgeId={selectedEdgeId}
          selectedFrameId={selectedFrameId}
          selectedNodeId={selectedNodeId}
          onSelectionChange={({
            edges: selectedEdges,
            frames: selectedFrames,
            nodes: selectedNodes,
          }) => {
            const nextNodeId = selectedNodes[0]?.id ?? null;
            const nextEdgeId = selectedEdges[0]?.id ?? null;
            const nextFrameId = selectedFrames[0]?.id ?? null;
            const hasSelection =
              Boolean(nextNodeId) ||
              Boolean(nextEdgeId) ||
              Boolean(nextFrameId);
            const selectionChanged =
              nextNodeId !== selectedNodeId ||
              nextEdgeId !== selectedEdgeId ||
              nextFrameId !== selectedFrameId;

            setSelectedNodeId(nextNodeId);
            setSelectedEdgeId(nextEdgeId);
            setSelectedFrameId(nextFrameId);

            if (selectionChanged) {
              setInspectorMinimized(false);
              setInspectorOpen(hasSelection);
              return;
            }

            if (!inspectorMinimized) {
              setInspectorOpen(hasSelection);
            }
          }}
        />
        {nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-4 top-[32%] z-20 flex justify-center">
            <Button
              className="pointer-events-auto gap-2 rounded-md"
              disabled={disabled}
              onClick={addNode}
              size="sm"
              type="button"
            >
              <Plus className="h-4 w-4" />
              {t('actions.addNode')}
            </Button>
          </div>
        ) : null}
      </div>
      {inspectorOpen ? (
        <MindCanvasInspectorPanel
          edge={selectedEdge}
          edges={edges.flatMap((edge) =>
            edge.data?.edge ? [edge.data.edge] : []
          )}
          frame={selectedFrame}
          node={selectedNode}
          nodes={nodes.map((node) => node.data.node)}
          onClose={closeInspector}
          onDeleteEdge={(edgeId) => {
            markGraphEdited();
            setEdges((current) => current.filter((edge) => edge.id !== edgeId));
            setDeletedEdgeIds((current) => [...current, edgeId]);
            setSelectedEdgeId(null);
            setSelectedFrameId(null);
            setInspectorOpen(false);
          }}
          onDeleteNode={(nodeId) => {
            markGraphEdited();
            setNodes((current) => current.filter((node) => node.id !== nodeId));
            setDeletedNodeIds((current) => [...current, nodeId]);
            setSelectedNodeId(null);
            setSelectedFrameId(null);
            setInspectorOpen(false);
          }}
          onMinimize={() => {
            setInspectorOpen(false);
            setInspectorMinimized(true);
          }}
          onOpenRelatedView={() => setRelatedViewOpen(true)}
          onUpdateEdge={updateEdge}
          onSmartPrompt={submitInspectorSmartPrompt}
          onUpdateNode={updateNode}
        />
      ) : null}
      {inspectorMinimized && selectedTitle ? (
        <button
          className="pointer-events-auto absolute top-40 left-3 z-40 flex items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-2 text-left shadow-2xl shadow-foreground/10 backdrop-blur"
          onClick={restoreInspector}
          style={{ maxWidth: 'min(22rem, calc(100vw - 1.5rem))' }}
          type="button"
        >
          <Maximize2 className="h-4 w-4 shrink-0 text-dynamic-blue" />
          <span className="min-w-0">
            <span className="block font-medium text-xs">
              {t('actions.restoreInspector')}
            </span>
            <span className="block truncate text-muted-foreground text-xs">
              {selectedTitle}
            </span>
          </span>
        </button>
      ) : null}
      {relatedViewOpen ? (
        <MindRelatedViewIsland
          edge={selectedEdge}
          edges={edges.flatMap((edge) =>
            edge.data?.edge ? [edge.data.edge] : []
          )}
          node={selectedNode}
          nodes={nodes.map((node) => node.data.node)}
          onClose={() => setRelatedViewOpen(false)}
          onSelectEdge={selectEdgeFromRelatedView}
          onSelectNode={selectNodeFromRelatedView}
        />
      ) : null}
    </section>
  );
}

function getMindGraphSignature({
  edges,
  nodes,
}: Pick<ReturnType<typeof toSaveMindGraphPayload>, 'edges' | 'nodes'>) {
  return JSON.stringify({
    edges: edges
      .map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...edge }) => edge)
      .sort((a, b) => a.id.localeCompare(b.id)),
    nodes: nodes
      .map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...node }) => node)
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

function hasPersistentEdgeChange(changes: EdgeChange<MindFlowEdge>[]) {
  return changes.some((change) => change.type !== 'select');
}

function hasPersistentNodeChange(changes: NodeChange<MindFlowNode>[]) {
  return changes.some((change) => change.type !== 'select');
}

function getFlowNodeCenter(node: MindFlowNode) {
  const mindNode = node.data.node;
  return {
    x:
      node.position.x + Math.max(mindNode.width || 0, node.width || 0, 280) / 2,
    y:
      node.position.y +
      Math.max(mindNode.height || 0, node.height || 0, 168) / 2,
  };
}

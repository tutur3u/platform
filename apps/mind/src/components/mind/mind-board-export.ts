import type { MindBoardSnapshot, MindEdge, MindNode } from '@tuturuuu/types/db';

type ExportInput = {
  edges: MindEdge[];
  nodes: MindNode[];
  snapshot: MindBoardSnapshot;
};

export function formatMindBoardAsJson({ edges, nodes, snapshot }: ExportInput) {
  return JSON.stringify(
    {
      board: snapshot.board,
      edges,
      groups: snapshot.groups,
      links: snapshot.links,
      nodes,
      tags: snapshot.tags,
    },
    null,
    2
  );
}

export function formatMindBoardAsMarkdown({
  edges,
  nodes,
  snapshot,
}: ExportInput) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, MindNode[]>();
  const rootNodes: MindNode[] = [];

  for (const node of nodes) {
    if (node.parentNodeId && nodeById.has(node.parentNodeId)) {
      childrenByParent.set(node.parentNodeId, [
        ...(childrenByParent.get(node.parentNodeId) ?? []),
        node,
      ]);
    } else {
      rootNodes.push(node);
    }
  }

  return [
    `# ${snapshot.board.title}`,
    snapshot.board.description?.trim() ?? null,
    `Nodes: ${nodes.length} | Edges: ${edges.length} | Tags: ${snapshot.tags.length}`,
    '## Nodes',
    ...sortNodes(rootNodes).map((node) =>
      formatNodeMarkdown(node, childrenByParent, 0)
    ),
    '## Relationships',
    edges.length
      ? edges.map((edge) => formatEdgeMarkdown(edge, nodeById)).join('\n')
      : 'No relationships.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formatNodeMarkdown(
  node: MindNode,
  childrenByParent: Map<string, MindNode[]>,
  depth: number
): string {
  const indent = '  '.repeat(depth);
  const body = node.body?.trim();
  const lines = [
    `${indent}- ${node.title} (${node.nodeType}, ${node.status}, ${node.horizon})`,
    body ? `${indent}  ${body}` : null,
    ...sortNodes(childrenByParent.get(node.id) ?? []).map((child) =>
      formatNodeMarkdown(child, childrenByParent, depth + 1)
    ),
  ];

  return lines.filter(Boolean).join('\n');
}

function formatEdgeMarkdown(edge: MindEdge, nodeById: Map<string, MindNode>) {
  const source = nodeById.get(edge.sourceNodeId)?.title ?? edge.sourceNodeId;
  const target = nodeById.get(edge.targetNodeId)?.title ?? edge.targetNodeId;
  const label = edge.label ? `, ${edge.label}` : '';

  return `- ${source} -> ${target} (${edge.edgeType}${label})`;
}

function sortNodes(nodes: MindNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.positionY !== b.positionY) return a.positionY - b.positionY;
    if (a.positionX !== b.positionX) return a.positionX - b.positionX;
    return a.title.localeCompare(b.title);
  });
}

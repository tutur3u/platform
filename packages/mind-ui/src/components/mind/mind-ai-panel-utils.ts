import type { QueryClient } from '@tanstack/react-query';
import {
  getMindBoardGraphSnapshot,
  saveMindGraph,
} from '@tuturuuu/internal-api/mind';
import type { MindAiPatchRecord, MindBoardSnapshot } from '@tuturuuu/types/db';
import type { UIMessage } from 'ai';
import { mergeMindPatchRecord } from './mind-ai-panel-actions';
import {
  organizeMindLayout,
  toFlowEdges,
  toFlowNodes,
  toSaveMindGraphPayload,
} from './mind-flow';

export function updateMindPatchCaches({
  boardId,
  patch,
  queryClient,
  wsId,
}: {
  boardId?: string | null;
  patch: MindAiPatchRecord;
  queryClient: QueryClient;
  wsId: string;
}) {
  const targetBoardId = patch.boardId || boardId;
  if (!targetBoardId) return;

  queryClient.setQueryData<{ patches: MindAiPatchRecord[] }>(
    ['mind', 'patches', wsId, targetBoardId],
    (current) => ({
      patches: mergeMindPatchRecord(current?.patches, patch),
    })
  );
  queryClient.setQueryData<
    MindBoardSnapshot & { patches?: MindAiPatchRecord[] }
  >(['mind', 'snapshot', wsId, targetBoardId], (current) =>
    current
      ? {
          ...current,
          patches: mergeMindPatchRecord(current.patches, patch),
        }
      : current
  );
}

export async function organizeAndSaveBoard(
  wsId: string,
  boardId: string
): Promise<MindBoardSnapshot> {
  const snapshot = await getMindBoardGraphSnapshot(wsId, boardId);
  const edges = toFlowEdges(snapshot.edges);
  const nodes = organizeMindLayout({
    edges,
    nodes: toFlowNodes(snapshot.nodes),
  });

  return saveMindGraph(
    wsId,
    boardId,
    toSaveMindGraphPayload({
      deletedEdgeIds: [],
      deletedNodeIds: [],
      edges,
      nodes,
    })
  );
}

export function formatChatAsMarkdown(messages: UIMessage[]) {
  return messages
    .map((message) => {
      const text = getMessageText(message);
      if (!text.trim()) return null;
      const role = message.role === 'user' ? 'User' : 'Mind';
      return `### ${role}\n\n${text.trim()}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function getMessageText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n\n');
}

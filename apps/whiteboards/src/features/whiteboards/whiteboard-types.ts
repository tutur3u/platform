import type { WorkspaceWhiteboardSummary } from '@tuturuuu/internal-api/whiteboards';
import type { useTranslations } from 'next-intl';

export type WhiteboardTranslator = ReturnType<typeof useTranslations>;

export interface Whiteboard {
  id: string;
  wsId: string;
  title: string;
  description?: string;
  dateCreated: Date;
  lastModified: Date;
  creatorName: string;
  archivedAt?: Date;
}

export const whiteboardKeys = {
  all: (wsId: string) => ['whiteboards', wsId] as const,
  list: (wsId: string) => ['whiteboards', wsId, 'list'] as const,
  detail: (wsId: string, boardId: string) =>
    ['whiteboards', wsId, 'detail', boardId] as const,
};

export function toWhiteboard(
  wsId: string,
  summary: WorkspaceWhiteboardSummary,
  unknownCreatorLabel: string
): Whiteboard {
  return {
    id: summary.id,
    wsId,
    title: summary.title,
    description: summary.description || undefined,
    dateCreated: new Date(summary.created_at),
    lastModified: new Date(summary.updated_at),
    creatorName: summary.creator_name || unknownCreatorLabel,
    archivedAt: summary.archived_at ? new Date(summary.archived_at) : undefined,
  };
}

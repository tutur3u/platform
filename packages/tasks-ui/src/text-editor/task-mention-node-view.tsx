'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TaskMentionNodeViewRenderer } from '@tuturuuu/ui/text-editor/mention-extension';
import { createRoot, type Root } from 'react-dom/client';
import { TaskMentionChip } from './task-mention-chip';

const taskMentionQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export const renderTaskMentionNodeView: TaskMentionNodeViewRenderer = ({
  editor,
  getPos,
  node,
  translations,
}) => {
  let currentAvatarUrl = node.attrs.avatarUrl as string | null;
  let currentDisplayName =
    (node.attrs.displayName as string | null)?.trim() || 'Member';
  let currentEntityId =
    (node.attrs.entityId as string | null) ??
    (node.attrs.userId as string | null) ??
    '';
  let currentSubtitle = (node.attrs.subtitle as string | null) ?? null;
  let currentWorkspaceId = (node.attrs.workspaceId as string | null) ?? null;
  let reactRoot: Root | null = null;

  const dom = document.createElement('span');
  dom.contentEditable = 'false';
  dom.style.display = 'inline-flex';
  dom.style.verticalAlign = 'middle';

  const renderTaskChip = () => {
    reactRoot ??= createRoot(dom);
    reactRoot.render(
      <QueryClientProvider client={taskMentionQueryClient}>
        <TaskMentionChip
          entityId={currentEntityId}
          displayNumber={currentDisplayName}
          avatarUrl={currentAvatarUrl}
          subtitle={currentSubtitle}
          workspaceId={currentWorkspaceId}
          translations={translations}
          editor={editor}
          onResolvedTaskMention={(attrs) => {
            const position = getPos();
            if (typeof position !== 'number') return;

            const currentNode = editor.state.doc.nodeAt(position);
            if (currentNode?.type.name !== 'mention') return;

            editor.view.dispatch(
              editor.state.tr.setNodeMarkup(position, undefined, {
                ...currentNode.attrs,
                avatarUrl: attrs.avatarUrl ?? null,
                displayName: attrs.displayName,
                entityId: attrs.entityId,
                priority: attrs.priority ?? null,
                subtitle: attrs.subtitle ?? null,
                workspaceId: attrs.workspaceId ?? null,
              })
            );
          }}
        />
      </QueryClientProvider>
    );
  };

  renderTaskChip();

  return {
    dom,
    update(updatedNode) {
      if (
        updatedNode.type.name !== 'mention' ||
        updatedNode.attrs.entityType !== 'task'
      ) {
        return false;
      }

      const nextDisplayName =
        (updatedNode.attrs.displayName as string | null)?.trim() || 'Member';
      const nextAvatarUrl = updatedNode.attrs.avatarUrl as string | null;
      const nextEntityId =
        (updatedNode.attrs.entityId as string | null) ??
        (updatedNode.attrs.userId as string | null) ??
        '';
      const nextSubtitle =
        (updatedNode.attrs.subtitle as string | null) ?? null;
      const nextWorkspaceId =
        (updatedNode.attrs.workspaceId as string | null) ?? null;

      if (
        nextDisplayName !== currentDisplayName ||
        nextAvatarUrl !== currentAvatarUrl ||
        nextEntityId !== currentEntityId ||
        nextSubtitle !== currentSubtitle ||
        nextWorkspaceId !== currentWorkspaceId
      ) {
        currentDisplayName = nextDisplayName;
        currentAvatarUrl = nextAvatarUrl;
        currentEntityId = nextEntityId;
        currentSubtitle = nextSubtitle;
        currentWorkspaceId = nextWorkspaceId;
        renderTaskChip();
      }

      return true;
    },
    destroy() {
      if (!reactRoot) return;
      const root = reactRoot;
      reactRoot = null;
      setTimeout(() => root.unmount(), 0);
    },
    ignoreMutation() {
      return true;
    },
  };
};

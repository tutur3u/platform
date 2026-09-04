'use client';

import {
  type SharedTaskContext,
  TaskEditDialog,
} from '@tuturuuu/tasks-ui/tu-do/shared/task-edit-dialog';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  SharedTaskEditResponse,
  SharedTaskResponse,
  SharedTaskViewResponse,
} from '@/app/api/v1/shared/tasks/[shareCode]/response';
import {
  getSharedTaskContentModel,
  getSharedTaskEditContext,
  getSharedTaskEditLists,
} from './content-contract';
import { SharedTaskReadOnlyContent } from './read-only-content';

interface CurrentUser {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

interface SharedTaskContentProps {
  response: SharedTaskResponse;
  shareCode: string;
  currentUser?: CurrentUser;
}

function SharedTaskViewShell({
  response,
}: {
  response: SharedTaskViewResponse;
}) {
  const router = useRouter();
  return (
    <SharedTaskReadOnlyContent
      response={response}
      onClose={() => router.push('/')}
    />
  );
}

function SharedTaskEditContent({
  response,
  currentUser,
  shareCode,
}: {
  response: SharedTaskEditResponse;
  currentUser?: CurrentUser;
  shareCode: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const isClosingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsOpen(false);
    router.push('/');
  }, [router]);

  const handleUpdate = useCallback(() => {
    if (isClosingRef.current || !isOpen) return;
    router.refresh();
  }, [router, isOpen]);

  const taskWithList = useMemo(
    () => ({
      ...response.task,
      list_id: response.task.list_id || response.list.id,
    }),
    [response.list.id, response.task]
  );

  const listsForContext = useMemo(
    () => getSharedTaskEditLists(response),
    [response]
  );

  const sharedContext: SharedTaskContext = useMemo(
    () => getSharedTaskEditContext(response, listsForContext),
    [response, listsForContext]
  );

  const memoizedCurrentUser = useMemo(
    () =>
      currentUser
        ? {
            id: currentUser.id,
            display_name: currentUser.display_name,
            avatar_url: currentUser.avatar_url,
            email: currentUser.email,
          }
        : undefined,
    [currentUser]
  );

  return (
    <TaskEditDialog
      wsId={response.workspace.id}
      task={taskWithList}
      boardId={response.board.id}
      isOpen={isOpen}
      mode="edit"
      collaborationMode={false}
      isPersonalWorkspace={false}
      shareCode={shareCode}
      sharedPermission="edit"
      currentUser={memoizedCurrentUser}
      sharedContext={sharedContext}
      onClose={handleClose}
      onUpdate={handleUpdate}
      availableLists={listsForContext}
    />
  );
}

export default function SharedTaskContent({
  response,
  currentUser,
  shareCode,
}: SharedTaskContentProps) {
  const model = getSharedTaskContentModel(response);
  if (model.kind === 'view') {
    return <SharedTaskViewShell response={model.response} />;
  }

  return (
    <SharedTaskEditContent
      response={model.response}
      currentUser={currentUser}
      shareCode={shareCode}
    />
  );
}

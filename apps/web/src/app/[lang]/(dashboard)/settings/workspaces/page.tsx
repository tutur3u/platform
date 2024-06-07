'use client';

import SettingItemTab from '../../../../../components/settings/SettingItemTab';
import { StrictModeDroppable } from '@/components/dnd/StrictModeDroppable';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Workspace } from '@/types/primitives/Workspace';
import { EyeIcon } from '@heroicons/react/24/outline';
import { showNotification } from '@mantine/notifications';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DragDropContext, Draggable, DropResult } from 'react-beautiful-dnd';
import { mutate } from 'swr';

export default function WorkspacesSettingPage() {
  const { workspaces: wss } = useWorkspaces();

  const [workspaces, setWorkspaces] = useState<Workspace[]>(wss || []);

  const { t } = useTranslation('settings-workspaces');

  const workspacesLabel = t('workspaces');
  const workspacesDescription = t('workspaces-description');

  useEffect(() => {
    setWorkspaces(wss || []);
  }, [wss]);

  const reorder = (list: Workspace[], startIndex: number, endIndex: number) => {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);

    return result;
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }

    const newWorkspaces = reorder(
      workspaces,
      result.source.index,
      result.destination.index
    );

    setWorkspaces(newWorkspaces);
  };

  const [isSaving, setIsSaving] = useState(false);

  const save = t('common:save');
  const saving = t('common:saving');

  const saveOrder = async () => {
    setIsSaving(true);

    const res = await fetch('/api/workspaces/order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspaces,
      }),
    });

    if (res.ok) {
      await mutate('/api/workspaces/current');

      showNotification({
        title: 'Success',
        message: 'Workspaces order saved',
        color: 'green',
      });
    } else {
      showNotification({
        title: 'Error',
        message: 'Something went wrong',
        color: 'red',
      });
    }

    setIsSaving(false);
  };

  return (
    <div className="w-full max-w-2xl">
      <SettingItemTab
        title={workspacesLabel}
        description={workspacesDescription}
      >
        <DragDropContext onDragEnd={onDragEnd}>
          <StrictModeDroppable droppableId="droppable">
            {(provided, _) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="grid"
              >
                {workspaces.map((ws, index) => (
                  <Draggable key={ws.id} draggableId={ws.id} index={index}>
                    {(provided, _) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className="mb-2 flex items-center justify-between gap-2 rounded border border-zinc-500/20 p-2 text-sm font-semibold text-zinc-900 dark:border-zinc-300 dark:border-zinc-300/10 dark:bg-zinc-900 dark:text-zinc-300"
                      >
                        <div className="flex items-center gap-2">
                          <div className="aspect-square rounded border border-purple-500/20 bg-purple-500/20 px-2 py-0.5 text-center text-purple-500 dark:border-purple-300/10 dark:bg-purple-300/10 dark:text-purple-300">
                            {index + 1}
                          </div>
                          <div>{ws.name}</div>
                        </div>

                        <Link
                          href={`/${ws.id}`}
                          className="hover:purple-500/30 rounded border border-purple-500/20 bg-purple-500/10 p-2 transition dark:border-purple-300/10 dark:bg-purple-300/10 dark:hover:bg-purple-300/20"
                        >
                          <EyeIcon className="h-5 w-5 text-purple-500 dark:text-purple-300" />
                        </Link>
                      </div>
                    )}
                  </Draggable>
                ))}

                {provided.placeholder}
              </div>
            )}
          </StrictModeDroppable>
        </DragDropContext>
      </SettingItemTab>

      <div
        onClick={saveOrder}
        className="col-span-full flex cursor-pointer items-center justify-center rounded border border-blue-500/20 bg-blue-500/10 p-2 font-semibold text-blue-600 transition duration-300 hover:border-blue-500/30 hover:bg-blue-500/20 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:border-blue-300/30 dark:hover:bg-blue-300/20"
      >
        {isSaving ? saving : save}
      </div>
    </div>
  );
}

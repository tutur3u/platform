import { ReactElement, useEffect, useState } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { useSegments } from '../../hooks/useSegments';
import HeaderX from '../../components/metadata/HeaderX';
import NestedLayout from '../../components/layouts/NestedLayout';
import useTranslation from 'next-translate/useTranslation';
import SettingItemTab from '../../components/settings/SettingItemTab';
import { enforceAuthenticated } from '../../utils/serverless/enforce-authenticated';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { DragDropContext, Draggable, DropResult } from 'react-beautiful-dnd';
import { Workspace } from '../../types/primitives/Workspace';
import { StrictModeDroppable } from '../../components/dnd/StrictModeDroppable';
import { EyeIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { mutate } from 'swr';
import { showNotification } from '@mantine/notifications';

export const getServerSideProps = enforceAuthenticated;

const WorkspacesSettingPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { workspaces: wss } = useWorkspaces();

  const [workspaces, setWorkspaces] = useState<Workspace[]>(wss || []);

  const { t } = useTranslation('settings-workspaces');

  const settings = t('common:settings');
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

  useEffect(() => {
    setRootSegment([
      {
        content: settings,
        href: '/settings',
      },
      {
        content: workspacesLabel,
        href: '/settings/workspaces',
      },
    ]);

    return () => {
      setRootSegment([]);
    };
  }, [workspacesLabel, settings, setRootSegment]);

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
      mutate('/api/workspaces/current');

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
    <div className="pb-20 md:max-w-lg">
      <HeaderX label="Settings" />

      <div className="grid">
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
                          className="mb-2 flex items-center justify-between gap-2 rounded border border-zinc-300/10 bg-zinc-900 p-2 text-sm font-semibold text-zinc-300"
                        >
                          <div className="flex items-center gap-2">
                            <div className="aspect-square rounded bg-purple-300/10 px-2 py-0.5 text-center text-purple-300">
                              {index + 1}
                            </div>
                            <div>{ws.name}</div>
                          </div>

                          <Link
                            href={`/${ws.id}`}
                            className="rounded border border-purple-300/10 bg-purple-300/10 p-2 transition hover:bg-purple-300/20"
                          >
                            <EyeIcon className="h-5 w-5 text-purple-300" />
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
          className="col-span-full flex cursor-pointer items-center justify-center rounded border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-300 transition duration-300 hover:border-blue-300/30 hover:bg-blue-300/20"
        >
          {isSaving ? saving : save}
        </div>
      </div>
    </div>
  );
};

WorkspacesSettingPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="settings">{page}</NestedLayout>;
};

export default WorkspacesSettingPage;

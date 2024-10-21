import TaskListEditForm from '../../forms/TaskListEditForm';
import { TaskList } from '@/types/primitives/TaskList';
import { Workspace } from '@/types/primitives/Workspace';
import {
  Accordion,
  AccordionControlProps,
  ActionIcon,
  Menu,
} from '@mantine/core';
import { openConfirmModal, openModal } from '@mantine/modals';
import { Ellipsis } from 'lucide-react';
import { mutate } from 'swr';

const TaskListAccordionControl = (
  props: AccordionControlProps & {
    ws: Workspace;
    boardId: string;
    list: TaskList;
  }
) => {
  const { ws, boardId, list, ...rest } = props;

  const updateList = async (list: TaskList) => {
    if (!list?.id) return;

    const res = await fetch(
      `/api/workspaces/${ws.id}/boards/${boardId}/lists/${list.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: list.name,
        }),
      }
    );

    if (res.ok)
      await mutate(`/api/workspaces/${ws.id}/boards/${boardId}/lists`);
  };

  const deleteList = async () => {
    if (!list?.id) return;

    const res = await fetch(`/api/tasks/lists/${list.id}`, {
      method: 'DELETE',
    });

    if (res.ok)
      await mutate(`/api/workspaces/${ws.id}/boards/${boardId}/lists`);
  };

  const showDeleteListModal = (list: TaskList) => {
    if (!list) return;
    openConfirmModal({
      title: (
        <div className="font-semibold">
          Delete {'"'}
          <span className="font-bold text-purple-300">{list.name}</span>
          {'" '}
          list
        </div>
      ),
      centered: true,
      children: (
        <div className="p-4 text-center">
          <p className="text-lg font-medium text-zinc-300">
            Are you sure you want to delete this list?
          </p>
          <p className="text-foreground/80 text-sm">
            All of your data will be permanently removed. This action cannot be
            undone.
          </p>
        </div>
      ),
      onConfirm: () => deleteList(),
      closeOnConfirm: true,
      labels: {
        confirm: 'Delete',
        cancel: 'Cancel',
      },
    });
  };

  const showEditListModal = (list: TaskList) => {
    openModal({
      title: list ? 'Edit list' : 'New list',
      centered: true,
      children: <TaskListEditForm list={list} onSubmit={updateList} />,
    });
  };

  return (
    <div className="mr-2 flex items-center gap-2">
      <Accordion.Control {...rest} />
      <Menu openDelay={100} closeDelay={400} withArrow position="right">
        <Menu.Target>
          <ActionIcon
            size="lg"
            className="bg-zinc-300/5 text-zinc-300 hover:bg-zinc-300/10"
          >
            <Ellipsis className="w-6" />
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown className="font-semibold">
          <Menu.Item disabled>Move list</Menu.Item>
          <Menu.Item disabled>Archive list</Menu.Item>
          <Menu.Item onClick={() => showEditListModal(list)}>
            List settings
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" onClick={() => showDeleteListModal(list)}>
            Delete list
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
};

export default TaskListAccordionControl;

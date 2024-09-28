import { Priority } from '@/types/primitives/Priority';
import { Task } from '@/types/primitives/Task';
import { User } from '@/types/primitives/User';
import { getInitials } from '@/utils/name-helper';
import {
  ActionIcon,
  Autocomplete,
  Avatar,
  Badge,
  Button,
  Group,
  Loader,
  Tabs,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { closeAllModals } from '@mantine/modals';
import { Check, Trash, TriangleAlert, X } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { ChangeEvent, useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';

interface TaskEditFormProps {
  task?: Task;
  listId: string;
  onUpdated: () => void;
}

type UserWithValue = User & { value: string };

const TaskEditForm = ({ task, listId, onUpdated }: TaskEditFormProps) => {
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState(task?.description || '');

  const [startDate] = useState<Date | null>(
    task?.start_date ? moment(task?.start_date).toDate() : null
  );

  const [endDate] = useState<Date | null>(
    task?.end_date ? moment(task?.end_date).toDate() : null
  );

  const [priority, setPriority] = useState<Priority>(task?.priority);

  const { data: assignees } = useSWR<User[]>(
    task?.id ? `/api/tasks/${task.id}/assignees` : null
  );

  const [candidateAssignees, setCandidateAssignees] = useState<User[] | null>(
    null
  );

  const isAssigneeAdded = (assigneeId: string) =>
    assignees?.find((a) => a.id === assigneeId);

  const getAllAssignees = () =>
    [...(assignees || []), ...(candidateAssignees || [])].filter(
      (assignee, index, self) =>
        index === self.findIndex((a) => a.id === assignee.id)
    );

  useEffect(() => {
    const taskNameElement = document.getElementById(
      'task-name'
    ) as HTMLTextAreaElement;

    // on focus, place cursor at the end of the text
    if (taskNameElement) {
      taskNameElement.focus();
      taskNameElement.setSelectionRange(
        taskNameElement.value.length,
        taskNameElement.value.length
      );
    }
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [debounced] = useDebouncedValue(searchQuery, 300);

  const [suggestions, setSuggestions] = useState<UserWithValue[]>([]);

  useEffect(() => {
    const fetchUsers = async (searchQuery: string) => {
      if (!searchQuery) return [];
      const response = await fetch(`/api/users/search?query=${searchQuery}`);

      if (response.ok) {
        return await response.json();
      }

      return [];
    };

    const fetchData = async (input: string) => {
      const users = await fetchUsers(input);
      const suggestedUsers = users.map((user: User) => ({
        ...user,
        value: `${user.handle} ${user.display_name} ${user.email}`,
      }));

      setSuggestions(suggestedUsers);
    };

    if (debounced) fetchData(debounced);
    else setSuggestions([]);
  }, [debounced]);

  const handleAssignUser = async (userId: string) => {
    if (!task?.id) return;

    const response = await fetch(`/api/tasks/${task.id}/assignees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
      }),
    });

    if (response.ok) {
      setSearchQuery('');
      setSuggestions([]);
    } else {
      // const res = await response.json();
      // showNotification({
      //   title: 'Could not assign user',
      //   message: res?.error?.message || 'Something went wrong',
      //   color: 'red',
      // });
    }
  };

  const handleUnassignUser = async (userId: string) => {
    if (!task?.id) return;

    if (!isAssigneeAdded(userId)) {
      setCandidateAssignees((prev) =>
        prev ? prev?.filter((assignee) => assignee.id !== userId) : null
      );
    }

    const response = await fetch(`/api/tasks/${task.id}/assignees/${userId}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      await mutate(`/api/tasks/${task.id}/assignees`);
    } else {
      // const res = await response.json();
      // showNotification({
      //   title: 'Could not unassign user',
      //   message: res?.error?.message || 'Something went wrong',
      //   color: 'red',
      // });
    }
  };

  const user = { id: 'TO-BE-REFACTORED' };
  const isUserLoading = true;

  const { data: creatorData, error: creatorError } = useSWR(
    task?.id ? `/api/tasks/${task.id}/activities` : null
  );

  const loadingCreator = !creatorData && !creatorError;

  const [currentTab, setCurrentTab] = useState<string | null>('details');

  const showSaveButton = () => {
    switch (currentTab) {
      case 'details':
      case 'datetime':
      case 'priority':
      case 'assignees':
        return true;

      default:
        return false;
    }
  };

  const showActionIcons = currentTab === 'details';

  const addTask = async () => {
    if (!listId) return;

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        description,
        priority,
        startDate,
        endDate,
        listId,
      }),
    });

    if (res.ok) onUpdated();
  };

  const updateTask = async () => {
    if (!task?.id) return;

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        description,
        priority,
        completed: task.completed,
        startDate,
        endDate,
        listId,
      }),
    });

    if (res.ok) onUpdated();
  };

  const handleSave = async () => {
    if (task?.id && candidateAssignees && candidateAssignees.length > 0) {
      const promises = candidateAssignees.map((assignee) =>
        assignee.id ? handleAssignUser(assignee.id) : null
      );

      await Promise.all(promises);
      await mutate(`/api/tasks/${task.id}/assignees`);
    }

    if (task?.id) await updateTask();
    else await addTask();
    closeAllModals();
  };

  const handleDelete = async () => {
    if (!task?.id) return;

    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      onUpdated();
      closeAllModals();
    } else {
      // const res = await response.json();
      // showNotification({
      //   title: 'Could not delete task',
      //   message: res?.error?.message || 'Something went wrong',
      //   color: 'red',
      // });
    }
  };

  const handleComplete = async () => {
    if (!task?.id) return;

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        completed: true,
      }),
    });

    if (res.ok) {
      onUpdated();
      closeAllModals();
    }
  };

  return (
    <>
      <Tabs defaultValue="details" value={currentTab} onChange={setCurrentTab}>
        <Tabs.List className="mb-2">
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="datetime">Duration</Tabs.Tab>
          <Tabs.Tab value="priority">Priority</Tabs.Tab>
          {task?.id && <Tabs.Tab value="activities">Activities</Tabs.Tab>}
          {task?.id && (
            <Tabs.Tab value="assignees">
              Assignees{' '}
              {assignees && assignees.length > 0 && (
                <Badge>{assignees?.length || 0}</Badge>
              )}
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="details">
          <TextInput
            id="task-name"
            label="Task name"
            placeholder="Enter task name"
            value={name}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setName(event.target.value)
            }
            autoComplete="off"
            className="mb-2"
            data-autofocus
          />

          <Textarea
            label="Description"
            placeholder="Enter task description"
            value={description}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setDescription(event.target.value)
            }
            autoComplete="off"
            className="mb-2"
            minRows={5}
            maxRows={10}
            autosize
          />
        </Tabs.Panel>

        <Tabs.Panel value="datetime">
          <div className="grid gap-4 md:grid-cols-2">
            {/* <DateTimePicker
              label="Start date"
              placeholder="When should the task start?"
              value={startDate}
              onChange={setStartDate}
              maxDate={endDate ?? undefined}
              popoverProps={{ withinPortal: true }}
            />
            <DateTimePicker
              label="Due date"
              placeholder="When should the task be completed?"
              value={endDate}
              onChange={setEndDate}
              minDate={startDate ?? undefined}
              popoverProps={{ withinPortal: true }}
            /> */}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="priority">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPriority(null)}
              className={`${
                priority === null
                  ? 'border-zinc-300/20 bg-zinc-500/20 text-zinc-300'
                  : 'border-zinc-300/10 bg-zinc-500/5 text-zinc-300/80 hover:bg-zinc-500/10'
              } rounded-md border p-8 font-semibold shadow-sm transition`}
            >
              None
            </button>

            <button
              onClick={() => setPriority((p) => (p !== 1 ? 1 : null))}
              className={`${
                priority === 1
                  ? 'border-green-300/20 bg-green-500/20 text-green-300'
                  : 'border-green-300/10 bg-green-500/5 text-green-300/80 hover:bg-green-500/10'
              } rounded-md border p-8 font-semibold shadow-sm transition`}
            >
              Low
            </button>

            <button
              onClick={() => setPriority((p) => (p !== 2 ? 2 : null))}
              className={`${
                priority === 2
                  ? 'border-blue-300/20 bg-blue-500/20 text-blue-300'
                  : 'border-blue-300/10 bg-blue-500/5 text-blue-300/80 hover:bg-blue-500/10'
              } rounded-md border p-8 font-semibold shadow-sm transition`}
            >
              Medium
            </button>

            <button
              onClick={() => setPriority((p) => (p !== 3 ? 3 : null))}
              className={`${
                priority === 3
                  ? 'border-purple-300/20 bg-purple-500/20 text-purple-300'
                  : 'border-purple-300/10 bg-purple-500/5 text-purple-300/80 hover:bg-purple-500/10'
              } rounded-md border p-8 font-semibold shadow-sm transition`}
            >
              High
            </button>

            <button
              onClick={() => setPriority((p) => (p !== 4 ? 4 : null))}
              className={`${
                priority === 4
                  ? 'border-orange-300/20 bg-orange-500/20 text-orange-300'
                  : 'border-orange-300/10 bg-orange-500/5 text-orange-300/80 hover:bg-orange-500/10'
              } rounded-md border p-8 font-semibold shadow-sm transition`}
            >
              Urgent
            </button>

            <button
              onClick={() => setPriority((p) => (p !== 5 ? 5 : null))}
              className={`${
                priority === 5
                  ? 'border-red-300/20 bg-red-500/20 text-red-300'
                  : 'border-red-300/10 bg-red-500/5 text-red-300/80 hover:bg-red-500/10'
              } rounded-md border p-8 font-semibold shadow-sm transition`}
            >
              Critical
            </button>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="activities">
          {loadingCreator ? (
            <div className="flex flex-col">
              <Loader className="h-6 w-6 self-center" color="blue" size="sm" />
            </div>
          ) : (
            <div>
              <div className="mt-4 flex items-center gap-2">
                <Avatar
                  color="blue"
                  radius="xl"
                  size="lg"
                  src={creatorData?.users?.avatar_url}
                >
                  {getInitials(creatorData?.users?.display_name || 'Unknown')}
                </Avatar>

                <div>
                  <span className="font-semibold text-blue-300">
                    {creatorData?.users?.display_name}
                  </span>{' '}
                  created this task{' '}
                  <span className="font-semibold">
                    {moment(creatorData?.created_at).fromNow()}
                  </span>
                  , at{' '}
                  <span className="font-semibold text-purple-300">
                    {moment(creatorData?.created_at).format(
                      'h:mm A, DD MMMM YYYY'
                    )}
                  </span>
                  .
                </div>
              </div>

              <div className="mt-8 flex items-center gap-2 rounded-lg bg-red-300/10 p-4 text-lg font-semibold text-red-300">
                <TriangleAlert className="h-6 w-6" />
                <div className="border-l-2 border-red-300/50 pl-2">
                  Other activities are not tracked yet. More activities will be
                  added soon.
                </div>
              </div>
            </div>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="assignees">
          <>
            <div className="flex gap-2">
              <Autocomplete
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Enter an handle"
                data={suggestions}
                className="flex-grow"
              />

              {isUserLoading ? (
                <Loader className="h-6 w-6" color="blue" size="sm" />
              ) : user &&
                (assignees?.length === 0 ||
                  !assignees?.some((assignee) => assignee.id === user.id)) ? (
                <button
                  className="rounded border border-blue-300/20 bg-blue-300/10 px-2 py-0.5 font-semibold text-blue-300 transition hover:bg-blue-300/20"
                  onClick={() =>
                    setCandidateAssignees((prev) => [...(prev || []), user])
                  }
                >
                  Assign me
                </button>
              ) : null}
            </div>

            {getAllAssignees().length > 0 && (
              <>
                <h3 className="mb-2 mt-4 text-center text-lg font-semibold">
                  Assignees
                </h3>
                <div className="grid gap-2 lg:grid-cols-2">
                  {getAllAssignees().map((assignee) =>
                    assignee.id ? (
                      <Group
                        key={assignee.id}
                        className={`relative w-full rounded-lg border p-4 ${
                          isAssigneeAdded(assignee.id)
                            ? 'border-blue-300/20 bg-blue-300/10'
                            : 'border-dashed border-zinc-300/20 bg-zinc-800'
                        }`}
                      >
                        <Link
                          href={`/${assignee.handle}`}
                          onClick={() => closeAllModals()}
                        >
                          <Avatar
                            color="blue"
                            radius="xl"
                            size="lg"
                            src={assignee.avatar_url}
                          >
                            {getInitials(assignee?.display_name || 'Unknown')}
                          </Avatar>
                        </Link>
                        <div>
                          <Text className="text-blue-200">
                            {assignee.display_name}
                          </Text>
                          <Text className="text-blue-100">
                            @{assignee.handle}
                          </Text>
                        </div>

                        <button
                          className="absolute right-1 top-1"
                          onClick={() => handleUnassignUser(assignee.id!)}
                        >
                          <X className="h-6 w-6 text-blue-200 transition hover:text-red-300" />
                        </button>
                      </Group>
                    ) : null
                  )}
                </div>
              </>
            )}
          </>
        </Tabs.Panel>
      </Tabs>

      {showSaveButton() && (
        <div className="mt-4 flex items-center gap-2">
          {task?.id && !task.completed && showActionIcons && (
            <>
              <ActionIcon
                onClick={handleComplete}
                color="green"
                size="lg"
                className="bg-green-300/10"
              >
                <Check className="h-6 w-6" />
              </ActionIcon>
            </>
          )}

          <Button
            fullWidth
            variant="subtle"
            onClick={handleSave}
            className="bg-blue-300/10"
            disabled={!name}
          >
            {task?.id ? 'Save changes' : 'Add task'}
          </Button>
          {task?.id && showActionIcons && (
            <>
              {/* <ActionIcon
                onClick={() => closeAllModals()}
                color="green"
                size="lg"
                className="bg-green-300/10"
              >
                <ArchiveBoxArrowDownIcon className="h-6 w-6" />
              </ActionIcon> */}
              <ActionIcon
                onClick={handleDelete}
                color="red"
                size="lg"
                className="bg-red-300/10"
              >
                <Trash className="h-6 w-6" />
              </ActionIcon>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default TaskEditForm;

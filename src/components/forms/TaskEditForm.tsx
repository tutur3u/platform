import {
  ActionIcon,
  Autocomplete,
  Avatar,
  Badge,
  Button,
  Group,
  Loader,
  Select,
  Tabs,
  Text,
  Textarea,
} from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { forwardRef, useEffect, useState } from 'react';
import { ChangeEvent } from 'react';
import { Task } from '../../types/primitives/Task';
import { DatePicker, TimeInput } from '@mantine/dates';
import moment from 'moment';
import { Priority } from '../../types/primitives/Priority';
import { useDebouncedValue } from '@mantine/hooks';
import { UserData } from '../../types/primitives/UserData';
import { showNotification } from '@mantine/notifications';
import useSWR, { mutate } from 'swr';
import { getInitials } from '../../utils/name-helper';
import {
  ExclamationTriangleIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { useUserData } from '../../hooks/useUserData';
import { TaskBoard } from '../../types/primitives/TaskBoard';
import { TaskList } from '../../types/primitives/TaskList';

interface TaskEditFormProps {
  task?: Task;
  listId?: string;
  boardId?: string;
  onUpdated: () => void;
}

type UserWithValue = UserData & { value: string };

const TaskEditForm = ({
  task,
  listId,
  boardId,
  onUpdated,
}: TaskEditFormProps) => {
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState(task?.description || '');

  const [startDate, setStartDate] = useState<Date | null>(
    task?.start_date ? moment(task?.start_date).toDate() : null
  );

  const [endDate, setEndDate] = useState<Date | null>(
    task?.end_date ? moment(task?.end_date).toDate() : null
  );

  const [priority, setPriority] = useState<Priority>(task?.priority);

  const [assignees, setAssignees] = useState<UserData[] | null>(null);
  const [candidateAssignees, setCandidateAssignees] = useState<
    UserData[] | null
  >(null);

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

  const handleTimeChange = (newDate: Date | null, date: Date | null) => {
    if (!newDate) return date;

    // Copy hours and minutes to old date
    if (date) {
      date.setHours(newDate.getHours());
      date.setMinutes(newDate.getMinutes());
    }

    return date;
  };

  const handleDateChange = (newDate: Date | null, date: Date | null) => {
    if (!newDate) return null;

    // Copy hours and minutes from old date
    if (date) {
      newDate.setHours(date.getHours());
      newDate.setMinutes(date.getMinutes());
    }

    return newDate;
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [debounced] = useDebouncedValue(searchQuery, 300);

  const [suggestions, setSuggestions] = useState<UserWithValue[]>([]);

  useEffect(() => {
    const fetchUsers = async (searchQuery: string) => {
      if (!searchQuery) return [];
      const response = await fetch(`/api/users/search?query=${searchQuery}`);

      if (response.ok) {
        const data = await response.json();
        return data;
      }

      return [];
    };

    const fetchData = async (input: string) => {
      const users = await fetchUsers(input);
      const suggestedUsers = users.map((user: UserData) => ({
        ...user,
        value: `${user.username} ${user.displayName} ${user.email}`,
      }));

      setSuggestions(suggestedUsers);
    };

    if (debounced) fetchData(debounced);
    else setSuggestions([]);
  }, [debounced]);

  // eslint-disable-next-line react/display-name
  const AutoCompleteItem = forwardRef<HTMLDivElement, UserWithValue>(
    (
      { username, avatarUrl, displayName, ...others }: UserWithValue,
      ref: React.ForwardedRef<HTMLDivElement>
    ) => (
      <div ref={ref} {...others}>
        <Group noWrap>
          <Avatar src={avatarUrl} />

          <div>
            <Text>{displayName}</Text>
            <Text size="xs" color="dimmed">
              {username ? `@${username}` : 'No username'}
            </Text>
          </div>
        </Group>
      </div>
    )
  );

  const { data: rawAssigneesData } = useSWR(
    task?.id ? `/api/tasks/${task.id}/assignees` : null
  );

  useEffect(() => {
    if (!rawAssigneesData || rawAssigneesData.length === 0) {
      setAssignees(null);
      return;
    }

    const assignees: UserData[] | null =
      rawAssigneesData != null
        ? rawAssigneesData?.map(
            (assignee: {
              id: string;
              display_name?: string;
              email?: string;
              phone?: string;
              username?: string;
              created_At?: string;
            }) => ({
              id: assignee.id,
              displayName: assignee.display_name,
              email: assignee.email,
              phone: assignee.phone,
              username: assignee.username,
              createdAt: assignee.created_At,
            })
          )
        : null;

    setAssignees(assignees);
  }, [rawAssigneesData]);

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
      const res = await response.json();
      showNotification({
        title: 'Could not assign user',
        message: res?.error?.message || 'Something went wrong',
        color: 'red',
      });
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
      mutate(`/api/tasks/${task.id}/assignees`);
    } else {
      const res = await response.json();
      showNotification({
        title: 'Could not unassign user',
        message: res?.error?.message || 'Something went wrong',
        color: 'red',
      });
    }
  };

  const { data: userData, isLoading: isUserLoading } = useUserData();

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

  const [currentBoardId, setCurrentBoardId] = useState<string | null>(
    task?.board_id || boardId || null
  );

  const [currentListId, setCurrentListId] = useState<string | null>(
    task?.list_id || listId || null
  );

  const { data: boards } = useSWR<TaskBoard[] | null>(
    userData?.id ? '/api/tasks/boards' : null
  );

  const { data: lists } = useSWR<TaskList[] | null>(
    userData?.id && currentBoardId
      ? `/api/tasks/lists?boardId=${currentBoardId}`
      : null
  );

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
        listId: currentListId,
      }),
    });

    if (res.ok) onUpdated();
  };

  const handleSave = async () => {
    if (task?.id && candidateAssignees && candidateAssignees.length > 0) {
      const promises = candidateAssignees.map((assignee) =>
        handleAssignUser(assignee.id)
      );

      await Promise.all(promises);
      mutate(`/api/tasks/${task.id}/assignees`);
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
      const res = await response.json();
      showNotification({
        title: 'Could not delete task',
        message: res?.error?.message || 'Something went wrong',
        color: 'red',
      });
    }
  };

  return (
    <>
      <Tabs
        defaultValue="details"
        value={currentTab}
        onTabChange={setCurrentTab}
      >
        <Tabs.List className="mb-2">
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="datetime">Date & Time</Tabs.Tab>
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
          <Textarea
            id="task-name"
            label="Task name"
            placeholder="Enter task name"
            value={name}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setName(event.target.value)
            }
            autoComplete="off"
            maxRows={5}
            autosize
            data-autofocus
            className="mb-2"
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

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Current board"
              value={currentBoardId}
              onChange={setCurrentBoardId}
              data={
                boards?.map((board) => ({
                  value: board.id,
                  label: board.name,
                })) || []
              }
              // disabled={!boards || boards?.length <= 1}
              disabled
            />
            <Select
              label="Current list"
              value={currentListId}
              onChange={setCurrentListId}
              data={
                lists?.map((list) => ({
                  value: list.id,
                  label: list.name,
                })) || []
              }
              disabled={!lists || lists?.length <= 1}
            />
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="datetime">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DatePicker
              label="Start date"
              placeholder="When should the task start?"
              value={startDate}
              onChange={(newDate) =>
                setStartDate((date) =>
                  date ? handleDateChange(newDate, date) : newDate
                )
              }
              maxDate={endDate || undefined}
              className="mb-2 lg:col-span-2"
            />

            {startDate && (
              <TimeInput
                label="Time"
                placeholder="At what time should the task start?"
                value={startDate}
                onChange={(newDate) =>
                  setStartDate((date) =>
                    date ? handleTimeChange(newDate, date) : newDate
                  )
                }
                clearable
              />
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DatePicker
              label="Due date"
              placeholder="When should the task be completed?"
              value={endDate}
              onChange={(newDate) =>
                setEndDate((date) =>
                  date ? handleDateChange(newDate, date) : newDate
                )
              }
              minDate={startDate || undefined}
              className="mb-2 lg:col-span-2"
            />

            {endDate && (
              <TimeInput
                label="Time"
                placeholder="At what time should the task be completed?"
                value={endDate}
                onChange={(newDate) =>
                  setEndDate((date) =>
                    date ? handleTimeChange(newDate, date) : newDate
                  )
                }
                clearable
              />
            )}
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
                <Avatar color="blue" radius="xl">
                  {getInitials(creatorData?.users.display_name || 'Unknown')}
                </Avatar>

                <div>
                  <span className="font-semibold text-blue-300">
                    {creatorData?.users.display_name}
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
                <ExclamationTriangleIcon className="h-6 w-6" />
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
                placeholder="Enter an username"
                itemComponent={AutoCompleteItem}
                data={suggestions}
                onItemSubmit={(item) => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { value, ...user } = item as UserWithValue;

                  // Update assignees
                  setCandidateAssignees((prev) => [...(prev || []), user]);

                  // Clear search query and suggestions
                  setSearchQuery('');
                  setSuggestions([]);
                }}
                className="flex-grow"
              />

              {isUserLoading ? (
                <Loader className="h-6 w-6" color="blue" size="sm" />
              ) : userData &&
                (assignees?.length === 0 ||
                  !assignees?.some(
                    (assignee) => assignee.id === userData.id
                  )) ? (
                <button
                  className="rounded border border-blue-300/20 bg-blue-300/10 px-2 py-0.5 font-semibold text-blue-300 transition hover:bg-blue-300/20"
                  onClick={() =>
                    setCandidateAssignees((prev) => [...(prev || []), userData])
                  }
                >
                  Assign me
                </button>
              ) : null}
            </div>

            {getAllAssignees().length > 0 && (
              <>
                <h3 className="mt-4 mb-2 text-center text-lg font-semibold">
                  Assignees
                </h3>
                <div className="grid gap-2 lg:grid-cols-2">
                  {getAllAssignees().map((assignee) => (
                    <Group
                      key={assignee.id}
                      className={`relative w-full rounded-lg border p-4 ${
                        isAssigneeAdded(assignee.id)
                          ? 'border-blue-300/20 bg-blue-300/10'
                          : 'border-dashed border-zinc-300/20 bg-zinc-800'
                      }`}
                    >
                      <Avatar color="blue" radius="xl">
                        {getInitials(assignee?.displayName || 'Unknown')}
                      </Avatar>
                      <div>
                        <Text weight="bold" className="text-blue-200">
                          {assignee.displayName}
                        </Text>
                        <Text weight="light" className="text-blue-100">
                          @{assignee.username}
                        </Text>
                      </div>

                      <button
                        className="absolute right-1 top-1"
                        onClick={() => handleUnassignUser(assignee.id)}
                      >
                        <XMarkIcon className="h-6 w-6 text-blue-200 transition hover:text-red-300" />
                      </button>
                    </Group>
                  ))}
                </div>
              </>
            )}
          </>
        </Tabs.Panel>
      </Tabs>

      {showSaveButton() && (
        <div className="mt-4 flex items-center gap-2">
          <Button
            fullWidth
            variant="subtle"
            onClick={handleSave}
            className="bg-blue-300/10"
            disabled={!name}
          >
            {task?.id ? 'Save' : 'Add'}
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
                <TrashIcon className="h-6 w-6" />
              </ActionIcon>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default TaskEditForm;

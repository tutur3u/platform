import {
  Autocomplete,
  Avatar,
  Button,
  Chip,
  Divider,
  Group,
  Loader,
  Text,
  Textarea,
} from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { forwardRef, useEffect, useState } from 'react';
import { ChangeEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Task } from '../../types/primitives/Task';
import { DatePicker, TimeInput } from '@mantine/dates';
import moment from 'moment';
import { Priority } from '../../types/primitives/Priority';
import { useDebouncedValue } from '@mantine/hooks';
import { UserData } from '../../types/primitives/UserData';
import { showNotification } from '@mantine/notifications';
import useSWR, { mutate } from 'swr';
import { getInitials } from '../../utils/name-helper';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { useUserData } from '../../hooks/useUserData';

interface TaskEditFormProps {
  task?: Task;
  listId: string;
  onSubmit: (org: Task, listId: string) => void;
  onDelete?: () => void;
}

type UserWithValue = UserData & { value: string };

const TaskEditForm = ({
  task,
  listId,
  onSubmit,
  onDelete,
}: TaskEditFormProps) => {
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState(task?.description || '');

  const [startDate, setStartDate] = useState<Date | null>(
    task?.start_date ? moment(task?.start_date).toDate() : null
  );

  const [endDate, setEndDate] = useState<Date | null>(
    task?.end_date ? moment(task?.end_date).toDate() : null
  );

  const [delayTask, setDelayTask] = useState(!!task?.start_date);
  const [dueTask, setDueTask] = useState(!!task?.end_date);
  const [priority, setPriority] = useState<Priority>(task?.priority);
  const [assignees, setAssignees] = useState<UserData[] | null>(null);

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

  const handleTimeChange = (timeDate: Date | null, date: Date | null) => {
    if (!timeDate) return date;

    const newDate = date ? new Date(date) : new Date();
    newDate.setHours(timeDate.getHours());
    newDate.setMinutes(timeDate.getMinutes());
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
        value: user?.username || user?.email,
      }));

      setSuggestions(suggestedUsers);
    };

    if (debounced) fetchData(debounced);
  }, [debounced]);

  // eslint-disable-next-line react/display-name
  const AutoCompleteItem = forwardRef<HTMLDivElement, UserWithValue>(
    (
      { id, value, username, avatarUrl, displayName, ...others }: UserWithValue,
      ref: React.ForwardedRef<HTMLDivElement>
    ) =>
      id === value ? (
        <div {...others} ref={ref}>
          <Text>{value}</Text>
        </div>
      ) : (
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
      mutate(`/api/tasks/${task.id}/assignees`);
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

  return (
    <>
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
        minRows={3}
        maxRows={7}
        autosize
      />

      {(delayTask || dueTask || priority) && <Divider className="my-4" />}

      {delayTask ? (
        <DatePicker
          label="Delays until"
          placeholder="When should the task start?"
          value={startDate}
          onChange={setStartDate}
          maxDate={endDate || undefined}
          className="mb-2"
        />
      ) : null}

      {delayTask && startDate && (
        <TimeInput
          label="Time"
          placeholder="At what time should the task start?"
          value={startDate}
          onChange={(timeDate) =>
            startDate
              ? setStartDate((date) => handleTimeChange(timeDate, date))
              : null
          }
          clearable
        />
      )}

      {delayTask && dueTask && <Divider className="my-4" />}

      {dueTask ? (
        <DatePicker
          label="Due date"
          placeholder="When should the task be completed?"
          value={endDate}
          onChange={setEndDate}
          minDate={startDate || undefined}
          className="mb-2"
        />
      ) : null}

      {dueTask && endDate && (
        <TimeInput
          label="Time"
          placeholder="At what time should the task be completed?"
          value={endDate}
          onChange={(timeDate) =>
            endDate
              ? setEndDate((date) => handleTimeChange(timeDate, date))
              : null
          }
          clearable
        />
      )}

      {(delayTask || dueTask) && priority && <Divider className="my-4" />}

      {priority && (
        <>
          <h3 className="mb-2 text-center text-lg font-semibold">
            Task priority
          </h3>
          <div className="flex flex-wrap justify-center gap-2">
            <Chip
              checked={priority === 1}
              onChange={(checked) => {
                setPriority(checked ? 1 : null);
              }}
              variant="filled"
              color="gray"
            >
              Low
            </Chip>

            <Chip
              checked={priority === 2}
              onChange={(checked) => {
                setPriority(checked ? 2 : null);
              }}
              variant="filled"
              color="blue"
            >
              Medium
            </Chip>

            <Chip
              checked={priority === 3}
              onChange={(checked) => {
                setPriority(checked ? 3 : null);
              }}
              variant="filled"
              color="grape"
            >
              High
            </Chip>

            <Chip
              checked={priority === 4}
              onChange={(checked) => {
                setPriority(checked ? 4 : null);
              }}
              variant="filled"
              color="orange"
            >
              Urgent
            </Chip>

            <Chip
              checked={priority === 5}
              onChange={(checked) => {
                setPriority(checked ? 5 : null);
              }}
              variant="filled"
              color="red"
            >
              Critical
            </Chip>
          </div>
        </>
      )}

      {assignees && (
        <>
          <Divider className="my-4" />

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
                handleAssignUser(user.id);
              }}
              className="flex-grow"
            />

            {isUserLoading ? (
              <Loader className="h-6 w-6" color="blue" size="sm" />
            ) : userData &&
              !assignees.some((assignee) => assignee.id === userData.id) ? (
              <button
                className="rounded border border-blue-300/20 bg-blue-300/10 px-2 py-0.5 font-semibold text-blue-300 transition hover:bg-blue-300/20"
                onClick={() => handleAssignUser(userData.id)}
              >
                Assign me
              </button>
            ) : null}
          </div>

          {assignees && assignees.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-center text-lg font-semibold">
                Assigned users ({assignees.length})
              </h3>
              <div className="grid gap-2 lg:grid-cols-2">
                {assignees.map((assignee) => (
                  <Group
                    key={assignee.id}
                    className="relative w-full rounded-lg border border-zinc-800/80 bg-blue-300/10 p-4"
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
      )}

      <Divider className="my-4" />

      <div className="flex flex-wrap justify-center gap-2">
        <Chip
          checked={delayTask}
          onChange={(checked) => {
            if (!checked) setStartDate(null);
            setDelayTask(checked);
          }}
          variant="filled"
        >
          Delay task
        </Chip>

        <Chip
          checked={dueTask}
          onChange={(checked) => {
            if (!checked) setEndDate(null);
            setDueTask(checked);
          }}
          variant="filled"
        >
          Due date
        </Chip>

        <Chip
          checked={!!priority}
          onChange={(checked) => {
            setPriority(checked ? 1 : null);
          }}
          variant="filled"
        >
          Priority
        </Chip>
        <Chip
          checked={!!assignees}
          disabled={assignees && assignees?.length > 0 ? true : false}
          onChange={(checked) => {
            if (assignees && assignees?.length > 0) return;
            setAssignees(checked ? [] : null);
          }}
          variant="filled"
        >
          Assignees
        </Chip>

        {/* <Chip disabled>Repeat</Chip> */}
        {/* <Chip disabled>Tags</Chip> */}
      </div>

      <div className="flex gap-2">
        {task?.id && onDelete && (
          <Button
            fullWidth
            variant="subtle"
            color="red"
            onClick={onDelete}
            mt="md"
          >
            Delete
          </Button>
        )}
        <Button
          fullWidth
          variant="subtle"
          onClick={() => {
            const newTask: Task = {
              id: task?.id || uuidv4(),
              name,
              description,
              priority,
              start_date: startDate,
              end_date: endDate,
            };

            onSubmit(newTask, listId);
            closeAllModals();
          }}
          mt="md"
          disabled={!name}
        >
          {task?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </>
  );
};

export default TaskEditForm;

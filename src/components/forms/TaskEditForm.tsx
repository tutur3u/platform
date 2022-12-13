import { Button, Chip, Divider, Textarea } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useEffect, useState } from 'react';
import { ChangeEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Task } from '../../types/primitives/Task';
import { DatePicker, TimeInput } from '@mantine/dates';
import moment from 'moment';

interface TaskEditFormProps {
  task?: Task;
  listId: string;
  onSubmit: (org: Task, listId: string) => void;
  onDelete?: () => void;
}

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

      {(delayTask || dueTask) && <Divider className="my-4" />}

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

      {startDate && (
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

      {endDate && (
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

        {delayTask || dueTask || (
          <>
            <Chip disabled>Repeat</Chip>
            <Chip disabled>Priority</Chip>
            <Chip disabled>Tags</Chip>
            <Chip disabled>Assignees</Chip>
          </>
        )}
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

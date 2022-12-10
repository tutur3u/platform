import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { ChangeEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Task } from '../../types/primitives/Task';

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

  return (
    <>
      {task?.id && (
        <TextInput
          label="Task ID"
          value={task?.id}
          disabled={!!task?.id}
          className="mb-2"
        />
      )}
      <TextInput
        label="Task name"
        placeholder="Enter task name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setName(event.target.value)
        }
        autoComplete="off"
        data-autofocus
      />
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
            const newTask = { id: task?.id || uuidv4(), name };
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

import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { ChangeEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { TaskList } from '../../types/primitives/TaskList';

interface TaskListEditFormProps {
  list?: TaskList;
  boardId: string;
  onSubmit?: (list: TaskList, boardId: string) => void;
  onDelete?: () => void;
}

const TaskListEditForm = ({
  list,
  boardId,
  onSubmit,
  onDelete,
}: TaskListEditFormProps) => {
  const [name, setName] = useState(list?.name || '');

  return (
    <>
      {boardId && (
        <TextInput
          label="Board ID"
          value={boardId}
          disabled={!!boardId}
          className="mb-2"
        />
      )}
      {list?.id && (
        <TextInput
          label="List ID"
          value={list?.id}
          disabled={!!list?.id}
          className="mb-2"
        />
      )}
      <TextInput
        label="List name"
        placeholder="Enter list name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setName(event.currentTarget.value)
        }
        data-autofocus
        autoComplete="off"
      />
      <div className="flex gap-2">
        {list?.id && onDelete && (
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
            const newList = {
              id: list?.id || uuidv4(),
              name,
              tasks: [],
              board_id: boardId,
            };

            if (onSubmit) onSubmit(newList, boardId);
            closeAllModals();
          }}
          mt="md"
        >
          {list?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </>
  );
};

export default TaskListEditForm;

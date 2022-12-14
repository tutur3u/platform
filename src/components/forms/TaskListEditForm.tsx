import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { ChangeEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { TaskList } from '../../types/primitives/TaskList';

interface TaskListEditFormProps {
  list?: TaskList;
  onSubmit?: (list: TaskList) => void;
  onDelete?: () => void;
}

const TaskListEditForm = ({
  list,
  onSubmit,
  onDelete,
}: TaskListEditFormProps) => {
  const [name, setName] = useState(list?.name || '');

  return (
    <>
      {list?.board_id && (
        <TextInput
          label="Board ID"
          value={list.board_id}
          disabled={!!list.board_id}
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
              board_id: list?.board_id || '',
            };

            if (onSubmit) onSubmit(newList);
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

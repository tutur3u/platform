import { TaskList } from '@/types/primitives/TaskList';
import { Button, TextInput } from '@mantine/core';
import { ChangeEvent, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

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
            // closeAllModals();
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

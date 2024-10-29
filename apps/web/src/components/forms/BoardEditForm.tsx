import { TaskBoard } from '@/types/primitives/TaskBoard';
import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import { ChangeEvent, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface BoardEditFormProps {
  board?: TaskBoard;
  onSubmit?: (board: TaskBoard) => void;
  onDelete?: () => void;
}

const BoardEditForm = ({ board, onSubmit, onDelete }: BoardEditFormProps) => {
  const [name, setName] = useState(board?.name || '');

  return (
    <>
      <TextInput
        label="Board name"
        placeholder="Enter board name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setName(event.currentTarget.value)
        }
        data-autofocus
        autoComplete="off"
      />
      <div className="flex gap-2">
        {board?.id && onDelete && (
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
            const newBoard = { id: board?.id || uuidv4(), name, lists: [] };
            if (onSubmit) onSubmit(newBoard);
            closeAllModals();
          }}
          mt="md"
        >
          {board?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </>
  );
};

export default BoardEditForm;

import { Workspace } from '@/types/primitives/Workspace';
import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import { ChangeEvent, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  ws?: Workspace;
  onSubmit: (ws: Workspace) => void;
  onDelete?: () => void;
}

const WorkspaceEditForm = ({ ws, onSubmit, onDelete }: Props) => {
  const [name, setName] = useState(ws?.name || '');

  return (
    <>
      <TextInput
        label="Workspace name"
        placeholder="Enter workspace name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setName(event.currentTarget.value)
        }
        data-autofocus
      />
      <div className="flex gap-2">
        {ws?.id && onDelete && (
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
            const newWorkspace = { id: ws?.id || uuidv4(), name } as Workspace;

            onSubmit(newWorkspace);
            closeAllModals();
          }}
          mt="md"
        >
          {ws?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </>
  );
};

export default WorkspaceEditForm;

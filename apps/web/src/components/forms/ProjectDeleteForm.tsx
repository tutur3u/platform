import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import { useState } from 'react';
import { Project } from '../../types/primitives/Project';

interface Props {
  project: Project;
  onDelete: (project: Project) => void;
}

export default function ProjectDeleteForm({ project, onDelete }: Props) {
  const [name, setName] = useState<string>('');
  const isDisabled = project.name !== name;

  return (
    <div className="flex flex-col gap-2">
      <div>
        This action cannot be undone. This will permanently delete the{' '}
        {project.name} project.
      </div>
      <div>
        Please type <span className="font-bold">{project.name}</span> to
        confirm.
      </div>
      <div className="flex flex-col">
        <TextInput onChange={(e) => setName(e.currentTarget.value)} />
        <Button
          className="border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
          fullWidth
          mt="md"
          disabled={isDisabled}
          onClick={() => {
            onDelete(project);
            closeAllModals();
          }}
        >
          Delete this project and all of its data
        </Button>
      </div>
    </div>
  );
}

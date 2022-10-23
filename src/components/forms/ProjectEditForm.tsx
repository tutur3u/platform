import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Project } from '../../types/primitives/Project';

interface ProjectEditFormProps {
  orgId: string;
  project?: Project;
  onSubmit: (orgId: string, project: Project) => void;
  onDelete?: () => void;
}

const ProjectEditForm = ({
  orgId,
  project,
  onSubmit,
  onDelete,
}: ProjectEditFormProps) => {
  const [name, setName] = useState(project?.name || '');

  return (
    <>
      {project?.id && (
        <TextInput
          label="Project ID"
          value={project?.id}
          disabled={!!project?.id}
          className="mb-2"
        />
      )}
      <TextInput
        label="Project name"
        placeholder="Enter project name"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        data-autofocus
      />
      <div className="flex gap-2">
        {project?.id && onDelete && (
          <Button
            fullWidth
            variant="subtle"
            color="red"
            onClick={() => {
              onDelete();
              closeAllModals();
            }}
            mt="md"
          >
            Delete
          </Button>
        )}
        <Button
          fullWidth
          variant="subtle"
          onClick={() => {
            const newProject = { id: project?.id || uuidv4(), name };

            onSubmit(orgId, newProject);
            closeAllModals();
          }}
          mt="md"
        >
          {project?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </>
  );
};

export default ProjectEditForm;

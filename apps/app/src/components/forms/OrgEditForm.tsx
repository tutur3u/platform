import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { ChangeEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Organization } from '../../types/primitives/Organization';

interface OrgEditFormProps {
  org?: Organization;
  onSubmit: (org: Organization) => void;
  onDelete?: () => void;
}

const OrgEditForm = ({ org, onSubmit, onDelete }: OrgEditFormProps) => {
  const [name, setName] = useState(org?.name || '');

  return (
    <>
      {org?.id && (
        <TextInput
          label="Organization ID"
          value={org?.id}
          disabled={!!org?.id}
          className="mb-2"
        />
      )}
      <TextInput
        label="Organization name"
        placeholder="Enter organization name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setName(event.currentTarget.value)
        }
        data-autofocus
      />
      <div className="flex gap-2">
        {org?.id && onDelete && (
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
            const newOrg = { id: org?.id || uuidv4(), name };

            onSubmit(newOrg);
            closeAllModals();
          }}
          mt="md"
          disabled={!name}
        >
          {org?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </>
  );
};

export default OrgEditForm;

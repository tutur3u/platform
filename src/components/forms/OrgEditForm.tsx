import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Organization } from '../../types/primitives/Organization';

// OrgEditFormProps
interface OrgEditFormProps {
  org?: Organization;
  onSubmit: (org: Organization) => void;
}

const OrgEditForm = ({ org, onSubmit }: OrgEditFormProps) => {
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
        onChange={(event) => setName(event.currentTarget.value)}
        data-autofocus
      />
      <Button
        fullWidth
        onClick={() => {
          const newOrg = { id: org?.id || uuidv4(), name };

          onSubmit(newOrg);
          closeAllModals();
        }}
        mt="md"
      >
        {org?.id ? 'Save' : 'Add'}
      </Button>
    </>
  );
};

export default OrgEditForm;

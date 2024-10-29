import { Team } from '@/types/primitives/Team';
import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import { ChangeEvent, useState } from 'react';

interface Props {
  team?: Team;
  onSubmit?: (team: Partial<Team>) => void;
  onDelete?: () => void;
}

const TeamEditForm = ({ team, onSubmit, onDelete }: Props) => {
  const [name, setName] = useState(team?.name || '');

  return (
    <>
      <TextInput
        label="Team name"
        placeholder="Enter team name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setName(event.currentTarget.value)
        }
        data-autofocus
      />
      <div className="flex gap-2">
        {team?.id && onDelete && (
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
            const newTeam = { id: team?.id || undefined, name };

            if (onSubmit) onSubmit(newTeam);
            closeAllModals();
          }}
          mt="md"
        >
          {team?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </>
  );
};

export default TeamEditForm;

import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import { useState } from 'react';
import { Team } from '../../types/primitives/Team';

interface Props {
  team: Team;
  onDelete: (team: Team) => void;
}

export default function TeamDeleteForm({ team, onDelete }: Props) {
  const [name, setName] = useState<string>('');
  const isDisabled = team.name !== name;

  return (
    <div className="flex flex-col gap-2">
      <div>
        This action cannot be undone. This will permanently delete the{' '}
        {team.name} team.
      </div>
      <div>
        Please type <span className="font-bold">{team.name}</span> to confirm.
      </div>
      <div className="flex flex-col">
        <TextInput onChange={(e) => setName(e.currentTarget.value)} />
        <Button
          className="border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
          fullWidth
          mt="md"
          disabled={isDisabled}
          onClick={() => {
            onDelete(team);
            closeAllModals();
          }}
        >
          Delete this team and all of its data
        </Button>
      </div>
    </div>
  );
}

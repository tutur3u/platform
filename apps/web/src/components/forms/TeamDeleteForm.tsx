import { Team } from '@/types/primitives/Team';
import { Button, Divider, TextInput } from '@mantine/core';
import { useState } from 'react';

interface Props {
  team: Team;
  onDelete: (team: Team) => void;
}

export default function TeamDeleteForm({ team, onDelete }: Props) {
  const [name, setName] = useState<string>('');
  const isDisabled = (team?.name || 'Untitled Team') !== name;

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded border border-red-300/10 bg-red-300/10 p-2 text-center font-semibold text-red-300">
        This will permanently delete this team from your workspace and cannot be
        undone.
      </div>
      <div>Please type the name of the team to confirm.</div>

      <Divider />

      <div className="grid gap-2">
        <TextInput
          label="Team name"
          placeholder={team?.name || 'Untitled Team'}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Button
          className="border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
          fullWidth
          disabled={isDisabled}
          onClick={() => {
            onDelete(team);
            // closeAllModals();
          }}
        >
          Delete this team and all of its data
        </Button>
      </div>
    </div>
  );
}

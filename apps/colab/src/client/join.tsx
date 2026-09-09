import { useMutation, useQueryClient } from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { Identity, RoomView } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useState } from 'react';
import { ErrorNotice } from './home';
import { useCopy } from './i18n';
import { SelectField } from './select-field';
export function Join({
  roomId,
  identity,
  joined,
}: {
  roomId: string;
  identity: Identity | null;
  joined: (room: RoomView) => void;
}) {
  const c = useCopy();
  const [teamId, setTeamId] = useState('team-1');
  const cache = useQueryClient();
  const join = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      colabRequest<RoomView>(`/rooms/${roomId}/join`, body),
    onSuccess: (room) => {
      cache.invalidateQueries({ queryKey: ['session'] });
      joined(room);
    },
  });
  return (
    <section className="join-card panel">
      <p className="eyebrow">{c.eyebrow}</p>
      <h1>{c.join}</h1>
      <p>{c.inviteHelp}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          join.mutate({
            name: f.get('name'),
            password: f.get('password'),
            teamId,
          });
        }}
      >
        {!identity && (
          <label>
            {c.name}
            <Input
              name="name"
              required
              maxLength={60}
              autoComplete="nickname"
              placeholder={c.namePlaceholder}
            />
          </label>
        )}
        <label>
          {c.password}
          <Input
            name="password"
            type="password"
            autoComplete="off"
            maxLength={200}
            required={!identity}
            placeholder={c.passwordPlaceholder}
          />
        </label>
        <label>
          {c.team}
          <SelectField label={c.team} value={teamId} onValueChange={setTeamId}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={`team-${i + 1}`}>
                {c.team} {i + 1}
              </option>
            ))}
          </SelectField>
        </label>
        <p className="fine-print">{c.joinTeamHelp}</p>
        <Button type="submit" className="w-full" disabled={join.isPending}>
          {join.isPending ? c.working : c.enter}
        </Button>
        <ErrorNotice error={join.error} />
      </form>
      <a
        className="button quiet wide"
        href={`/auth/login?returnTo=${encodeURIComponent(`/?room=${roomId}`)}`}
      >
        {c.login} ↗
      </a>
    </section>
  );
}

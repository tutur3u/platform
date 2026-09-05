import { useMutation, useQueryClient } from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { Identity, RoomView } from '@tuturuuu/multiplayer';
import { ErrorNotice } from './home';
import { useCopy } from './i18n';
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
            teamId: f.get('teamId'),
          });
        }}
      >
        {!identity && (
          <label>
            {c.name}
            <input
              name="name"
              required
              maxLength={60}
              autoComplete="nickname"
            />
          </label>
        )}
        <label>
          {c.password}
          <input
            name="password"
            type="password"
            autoComplete="off"
            maxLength={200}
            required={!identity}
          />
        </label>
        <label>
          {c.team}
          <select name="teamId">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={`team-${i + 1}`}>
                {c.team} {i + 1}
              </option>
            ))}
          </select>
        </label>
        <p className="fine-print">{c.joinTeamHelp}</p>
        <button
          type="submit"
          className="primary wide"
          disabled={join.isPending}
        >
          {join.isPending ? c.working : c.enter}
        </button>
        <ErrorNotice error={join.error} />
      </form>
      <a className="button quiet wide" href="/auth/login">
        {c.login} ↗
      </a>
    </section>
  );
}

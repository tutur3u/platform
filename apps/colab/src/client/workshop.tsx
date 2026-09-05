import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { Identity, RoomView } from '@tuturuuu/multiplayer';
import { useEffect, useState } from 'react';
import { Admin } from './admin';
import { ErrorNotice } from './home';
import { useCopy } from './i18n';
import { Join } from './join';
import { TeamDesk } from './team-desk';

export function Workshop({
  roomId,
  identity,
  leave,
}: {
  roomId: string;
  identity: Identity | null;
  leave: () => void;
}) {
  const c = useCopy();
  const cache = useQueryClient();
  const key = ['room', roomId];
  const [online, setOnline] = useState(false);
  const [selected, setSelected] = useState('');
  const [now, setNow] = useState(Date.now());
  const query = useQuery({
    queryKey: key,
    queryFn: () => colabRequest<RoomView>(`/rooms/${roomId}`),
    refetchInterval: online ? false : 15000,
  });
  const joined = (room: RoomView) => cache.setQueryData(key, room);
  const mutate = useMutation({
    mutationFn: ({
      route,
      body,
    }: {
      route: string;
      body: Record<string, unknown>;
    }) => colabRequest<RoomView>(`/rooms/${roomId}/${route}`, body),
    onSuccess: joined,
  });
  const action = async (body: Record<string, unknown>, route = 'action') => {
    await mutate.mutateAsync({ route, body });
  };
  const activeId = query.data?.self.id;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!activeId) return;
    let disposed = false;
    let socket: WebSocket;
    let reconnect: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${roomId}/live`
      );
      socket.onopen = () => {
        setOnline(true);
        attempts = 0;
      };
      socket.onmessage = (event) => {
        if (event.data === 'pong') return;
        try {
          if (JSON.parse(event.data).type === 'access_revoked') {
            cache.removeQueries({ queryKey: ['room', roomId] });
            socket.close(1000);
            return;
          }
          const room = JSON.parse(event.data) as RoomView;
          if (room.id === roomId && room.self?.id === activeId)
            cache.setQueryData(['room', roomId], room);
        } catch {
          socket.close();
        }
      };
      socket.onclose = (event) => {
        setOnline(false);
        if (event.code === 1008) {
          cache.removeQueries({ queryKey: ['room', roomId] });
          cache.invalidateQueries({ queryKey: ['session'] });
          return;
        }
        if (!disposed)
          reconnect = setTimeout(
            connect,
            Math.min(1000 * 2 ** attempts++, 15000)
          );
      };
    };
    connect();
    const heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send('ping');
    }, 20000);
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      clearInterval(heartbeat);
      socket.close();
      setOnline(false);
    };
  }, [roomId, activeId, cache]);
  if (query.isPending) return <div className="loading">{c.loading}</div>;
  if (!query.data || query.isError)
    return (
      <div className="workshop">
        <button type="button" className="quiet" onClick={leave}>
          ← {c.back}
        </button>
        <Join roomId={roomId} identity={identity} joined={joined} />
      </div>
    );
  const room = query.data;
  const team =
    room.teams.find((t) => t.id === (selected || room.self.teamId)) ??
    room.teams[0];
  const writable =
    room.mode === 'open' && now >= room.startsAt && now < room.endsAt;
  const phase =
    room.mode !== 'open'
      ? c[room.mode]
      : now < room.startsAt
        ? c.scheduled
        : now >= room.endsAt
          ? c.readonly
          : c.open;
  return (
    <div className="workshop">
      <div className="room-heading">
        <div>
          <button type="button" className="quiet back" onClick={leave}>
            ← {c.back}
          </button>
          <h1>{room.title}</h1>
          <p className="room-meta">
            <span className="status">
              <span className="live-dot" />
              {phase}
            </span>
            <span>
              {new Date(room.startsAt).toLocaleString()} —{' '}
              {new Date(room.endsAt).toLocaleTimeString()}
            </span>
          </p>
        </div>
        <div className="presence">
          <div className="avatars">
            {room.members.slice(0, 5).map((m) => (
              <span className="avatar" title={m.name} key={m.id}>
                {m.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          <span>
            {online ? `${room.online.length} ${c.online}` : c.offline}
          </span>
        </div>
      </div>
      <div className="workshop-layout">
        <aside id="mission" className="mission panel">
          <p className="eyebrow">{c.mission}</p>
          <h2>{room.scenario.title}</h2>
          <p>{room.scenario.brief}</p>
          <h3>{c.criteria}</h3>
          <ol>
            {room.scenario.criteria.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <div className="mission-bottom">
            <span className="section-number">{c.sandbox}</span>
            <p className="fine-print">{c.sandboxHelp}</p>
          </div>
        </aside>
        <section className="team-area">
          <div className="team-toolbar">
            <label>
              {c.teamWork}
              <select
                value={team?.id ?? ''}
                onChange={(e) => setSelected(e.target.value)}
              >
                {room.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="privacy-label">
              {room.showcase ? c.showcaseOn : c.showcaseOff}
            </span>
          </div>
          {!writable && <p className="notice">{c.readOnlyHelp}</p>}
          <ErrorNotice error={mutate.error} />
          {team && (
            <TeamDesk
              key={team.id}
              team={team}
              writable={writable && team.id === room.self.teamId}
              busy={mutate.isPending}
              action={action}
            />
          )}
        </section>
      </div>
      {room.self.admin && (
        <Admin room={room} action={action} busy={mutate.isPending} />
      )}
      <p className="fine-print budget">
        {c.limitHint} ({room.aiCalls}/200)
      </p>
    </div>
  );
}

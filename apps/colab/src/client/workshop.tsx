import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColabRequestError, colabRequest } from '@tuturuuu/internal-api/colab';
import type { Identity, RoomView } from '@tuturuuu/multiplayer';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useEffect, useState } from 'react';
import { ActivityLog } from './activity-log';
import { Admin } from './admin';
import { ErrorNotice } from './home';
import { useCopy } from './i18n';
import { Join } from './join';
import { MissionBrief } from './mission-brief';
import { useWorkspaceLocation } from './navigation';
import { newestRoomView } from './room-cache';
import { SelectField } from './select-field';
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
  const currentLocation = useWorkspaceLocation();
  const requestedSection =
    new URL(currentLocation, location.origin).hash.slice(1) || 'mission';
  const cache = useQueryClient();
  const key = ['room', roomId];
  const [online, setOnline] = useState(false);
  const [selected, setSelected] = useState('');
  const [now, setNow] = useState(Date.now());
  const query = useQuery({
    queryKey: key,
    queryFn: () => colabRequest<RoomView>(`/rooms/${roomId}`),
    refetchInterval: online ? false : 15000,
    structuralSharing: newestRoomView,
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
    // Reconnect with renewed credentials while retaining the cached room and draft.
    if (!activeId || !identity?.expires) return;
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
        if (disposed) return;
        setOnline(false);
        if (
          event.code === 1008 &&
          event.reason === 'session_expired' &&
          identity?.email
        ) {
          void cache.invalidateQueries({ queryKey: ['session'] });
        } else if (event.code === 1008) {
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
  }, [roomId, activeId, cache, identity?.expires, identity?.email]);
  if (query.isPending) return <div className="loading">{c.loading}</div>;
  const unavailable =
    query.error instanceof TypeError ||
    (query.error instanceof ColabRequestError && query.error.status >= 500);
  if (!query.data || (query.isError && !unavailable))
    return (
      <div className="workshop">
        <Button type="button" variant="ghost" onClick={leave}>
          ← {c.back}
        </Button>
        <Join roomId={roomId} identity={identity} joined={joined} />
      </div>
    );
  const room = query.data;
  const allowedSections = [
    'mission',
    'team-prompt',
    'team-skills',
    'sandbox-desk',
    'practice-journal',
    'activity',
    ...(room.self.admin ? ['controls'] : []),
  ];
  const section = allowedSections.includes(requestedSection)
    ? requestedSection
    : 'mission';
  const ownTeam = room.teams.find((t) => t.id === room.self.teamId);
  if (selected && !room.teams.some((t) => t.id === selected)) setSelected('');
  const team =
    room.teams.find((t) => t.id === (selected || room.self.teamId)) ??
    ownTeam ??
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
          <h1>{room.title}</h1>
          <p className="room-meta">
            <Badge variant="outline">{phase}</Badge>
            <span>
              {new Date(room.startsAt).toLocaleString()} —{' '}
              {new Date(room.endsAt).toLocaleTimeString()}
            </span>
          </p>
        </div>
        <div className="presence">
          <div className="avatars">
            {room.members.slice(0, 5).map((m) => (
              <Avatar
                title={m.name}
                key={m.id}
                className="-ml-1 size-7 border-2 border-background"
              >
                <AvatarFallback className="text-xs">
                  {m.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span>
            {online ? `${room.online.length} ${c.online}` : c.offline}
          </span>
        </div>
      </div>
      <ErrorNotice error={mutate.error} />
      <div className="workshop-layout">
        <div hidden={section !== 'mission'}>
          <MissionBrief room={room} />
        </div>
        <section
          className="team-area"
          hidden={['mission', 'activity', 'controls'].includes(section)}
        >
          <div className="team-toolbar">
            <label>
              {c.teamWork}
              <SelectField
                label={c.teamWork}
                value={team?.id ?? ''}
                onValueChange={(value) => setSelected(value)}
              >
                {room.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectField>
            </label>
            <Badge
              variant="outline"
              className="max-w-full whitespace-normal text-xs"
              role="status"
            >
              {room.showcase ? c.showcaseOn : c.showcaseOff}
            </Badge>
          </div>
          {!writable && (
            <Alert>
              <AlertDescription>{c.readOnlyHelp}</AlertDescription>
            </Alert>
          )}
          {ownTeam && (
            <div className="own-team-desk" hidden={team?.id !== ownTeam.id}>
              <TeamDesk
                key={ownTeam.id}
                team={ownTeam}
                section={section}
                active={team?.id === ownTeam.id}
                writable={writable}
                busy={mutate.isPending}
                action={action}
                roomAiAvailable={room.aiCalls < room.limits.aiCallLimit}
              />
            </div>
          )}
          {team && team.id !== ownTeam?.id && (
            <TeamDesk
              key={team.id}
              team={team}
              section={section}
              writable={false}
              busy={mutate.isPending}
              action={action}
              roomAiAvailable={room.aiCalls < room.limits.aiCallLimit}
            />
          )}
        </section>
      </div>
      {section === 'activity' && <ActivityLog room={room} />}
      {room.self.admin && (
        <div hidden={section !== 'controls'}>
          <Admin room={room} action={action} busy={mutate.isPending} />
        </div>
      )}
      <div className="workshop-budget" role="status">
        <span>{c.roomBudget}</span>
        <strong>
          {room.aiCalls} / {room.limits.aiCallLimit} {c.aiOperationsShort}
        </strong>
        <span>
          {room.limits.agentTurnLimit} {c.turnsShort} ·{' '}
          {room.limits.toolCallLimit} {c.toolCallsShort} {c.perRun}
        </span>
      </div>
    </div>
  );
}

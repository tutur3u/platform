import { createFileRoute } from '@tanstack/react-router';
import { objectBounds } from '@tuturuuu/worlds';
import { edufestHall as world } from '@tuturuuu/worlds/edufest-hall';
import { useEffect, useRef, useState } from 'react';
import { connectRoom, type RoomState } from '../multiplayer/room-client.ts';
import { ROOM_SOCKET_PATH } from '../multiplayer/room-protocol.ts';

const copy = {
  en: {
    title: 'EduFest hall',
    entrance: 'Entrance',
    stage: 'Stage',
    booth: 'Booth',
    map: 'Hall floor plan',
    join: 'Join room',
    leave: 'Leave room',
    joining: 'Joining room…',
    joined: 'In room',
    unavailable:
      'Could not join or stay connected. Check your Worlds session and try again.',
    expired: 'Room session expired. Sign in again if needed.',
    directions: ['West', 'North', 'South', 'East'],
    self: 'You',
    peer: 'Nearby player',
  },
  vi: {
    title: 'Hội trường EduFest',
    entrance: 'Lối vào',
    stage: 'Sân khấu',
    booth: 'Gian',
    map: 'Sơ đồ hội trường',
    join: 'Vào phòng',
    leave: 'Rời phòng',
    joining: 'Đang vào phòng…',
    joined: 'Đã vào phòng',
    unavailable:
      'Không thể vào hoặc duy trì kết nối. Hãy kiểm tra phiên Worlds của bạn và thử lại.',
    expired: 'Phiên phòng đã hết hạn. Hãy đăng nhập lại nếu cần.',
    directions: ['Tây', 'Bắc', 'Nam', 'Đông'],
    self: 'Bạn',
    peer: 'Người chơi ở gần',
  },
};

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    lang: search.lang === 'vi' ? ('vi' as const) : ('en' as const),
  }),
  component: Hall,
});

function Hall() {
  const { lang } = Route.useSearch();
  const labels = copy[lang];
  const { width, depth } = world.bounds;
  const [room, setRoom] = useState<RoomState>({ status: 'idle' });
  const connection = useRef<ReturnType<typeof connectRoom> | null>(null);
  useEffect(() => () => connection.current?.dispose(), []);

  const inRoom = room.status === 'joining' || room.status === 'joined';
  const players = room.status === 'joined' ? [room.self, ...room.peers] : [];

  function joinRoom() {
    connection.current?.dispose();
    const url = new URL(ROOM_SOCKET_PATH, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    connection.current = connectRoom(url, setRoom);
  }
  return (
    <main className="world-view">
      <header>
        <h1>{labels.title}</h1>
        <nav aria-label={lang === 'vi' ? 'Ngôn ngữ' : 'Language'}>
          <a
            href="?lang=en"
            lang="en"
            aria-current={lang === 'en' ? 'true' : undefined}
          >
            English
          </a>
          <a
            href="?lang=vi"
            lang="vi"
            aria-current={lang === 'vi' ? 'true' : undefined}
          >
            Tiếng Việt
          </a>
        </nav>
      </header>
      <p>
        {inRoom ? (
          <button type="button" onClick={() => connection.current?.leave()}>
            {labels.leave}
          </button>
        ) : (
          <button type="button" onClick={joinRoom}>
            {labels.join}
          </button>
        )}{' '}
        <span role="status">
          {room.status === 'idle' ? '' : labels[room.status]}
        </span>
      </p>
      <section
        className="map"
        aria-label={labels.map}
        style={{ aspectRatio: width / depth }}
      >
        {world.objects.map((object) => {
          const { min, max } = objectBounds(object);
          const label =
            object.kind === 'booth'
              ? `${labels.booth} ${Number(object.id.slice(1))}`
              : labels.stage;
          return (
            <span
              key={object.id}
              className={object.kind}
              aria-label={label}
              title={label}
              style={{
                left: `${(100 * min.x) / width}%`,
                top: `${(100 * min.z) / depth}%`,
                width: `${(100 * (max.x - min.x)) / width}%`,
                height: `${(100 * (max.z - min.z)) / depth}%`,
              }}
            >
              {object.kind === 'booth'
                ? Number(object.id.slice(1))
                : labels.stage}
            </span>
          );
        })}
        {world.spawns.map(({ x, z }) => (
          <span
            className="spawn"
            key={`${x}:${z}`}
            style={{
              left: `${(100 * x) / width}%`,
              top: `${(100 * z) / depth}%`,
            }}
          >
            {labels.entrance}
          </span>
        ))}
        {players.map((player, index) => {
          const label = index === 0 ? labels.self : labels.peer;
          return (
            <span
              key={player.id}
              className="spawn"
              title={label}
              aria-label={label}
              role="img"
              style={{
                left: `${(100 * player.x) / width}%`,
                top: `${(100 * player.z) / depth}%`,
              }}
            >
              {index === 0 ? '●' : '○'}
            </span>
          );
        })}
      </section>
      {room.status === 'joined' && (
        <p>
          {(
            [
              [-0.5, 0],
              [0, -0.5],
              [0, 0.5],
              [0.5, 0],
            ] as const
          ).map(([dx, dz], index) => (
            <button
              key={labels.directions[index]}
              type="button"
              onClick={() => connection.current?.move(dx, dz)}
            >
              {labels.directions[index]}
            </button>
          ))}
        </p>
      )}
    </main>
  );
}

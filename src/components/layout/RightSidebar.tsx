import { Avatar, Indicator, Tooltip } from '@mantine/core';
import { useUserList } from '../../hooks/useUserList';
import { SidebarProps } from '../../types/SidebarProps';
import { getInitials } from '../../utils/name-helper';

function RightSidebar({ className }: SidebarProps) {
  const { users } = useUserList();

  return (
    <div
      className={`group fixed top-0 right-0 z-20 hidden h-full flex-col items-center justify-start gap-3 border-l border-zinc-800/80 bg-zinc-900 backdrop-blur-lg md:flex ${className} ${
        users.length > 0 ? 'w-full px-2 py-4' : 'w-0'
      }`}
    >
      {users.map((user) => (
        <Tooltip
          key={user.id}
          label={
            <div className="font-semibold">
              <div>{user?.displayName || 'Unknown'}</div>
              {user?.username && (
                <div className="text-blue-300">@{user.username}</div>
              )}
            </div>
          }
          disabled={!user?.displayName}
          position="right"
          color="#182a3d"
          offset={20}
          withArrow
        >
          <Indicator
            color="cyan"
            position="bottom-end"
            size={12}
            offset={5}
            withBorder
          >
            <Avatar
              className="self-center"
              key={user.id}
              color="blue"
              radius="xl"
            >
              {getInitials(user?.displayName ?? 'Unknown')}
            </Avatar>
          </Indicator>
        </Tooltip>
      ))}
    </div>
  );
}

export default RightSidebar;

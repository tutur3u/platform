import { Avatar, Indicator, Tooltip } from '@mantine/core';
import { SidebarProps } from '../../types/SidebarProps';
import { getInitials } from '../../utils/name-helper';
import { User } from '../../types/primitives/User';

function RightSidebar({ className }: SidebarProps) {
  const users: User[] = [];

  return (
    <div
      className={`group fixed right-0 top-0 z-20 hidden h-full flex-col items-center justify-start gap-3 border-l border-zinc-800/80 bg-zinc-900 backdrop-blur-lg md:flex ${className} ${
        users.length > 0 ? 'w-full px-2 py-4' : 'w-0'
      }`}
    >
      {users.map((user, idx) => (
        <Tooltip
          key={user?.id || idx}
          label={
            <div className="font-semibold">
              <div>{user?.display_name || 'Unknown'}</div>
              {user?.handle && (
                <div className="text-blue-300">@{user.handle}</div>
              )}
            </div>
          }
          disabled={!user?.display_name}
          position="left"
          color="#182a3d"
          offset={20}
          withArrow
        >
          <div className="flex w-full items-center justify-center gap-2">
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
                {getInitials(user?.display_name ?? 'Unknown')}
              </Avatar>
            </Indicator>

            <div className="w-full overflow-hidden">
              <div className="text-md min-w-max font-bold">
                {user?.display_name || user?.email || 'Not logged in'}
              </div>
              {user?.handle && (
                <div className="min-w-max text-sm font-semibold text-blue-300">
                  @{user?.handle}
                </div>
              )}
            </div>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

export default RightSidebar;

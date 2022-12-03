import { Avatar, Indicator, Tooltip } from '@mantine/core';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserList } from '../../hooks/useUserList';
import { SidebarProps } from '../../types/SidebarProps';
import { getInitials } from '../../utils/name-helper';

function RightSidebar({ className }: SidebarProps) {
  const { rightSidebar } = useAppearance();
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
          disabled={!user?.displayName || rightSidebar !== 'closed'}
          position="right"
          color="#182a3d"
          offset={20}
          withArrow
        >
          <div
            className={`flex w-full items-center justify-center gap-2 ${
              rightSidebar !== 'closed' ? 'translate-x-1' : ''
            }`}
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

            <div
              className={`w-full overflow-hidden ${
                rightSidebar === 'closed'
                  ? 'md:hidden'
                  : rightSidebar === 'auto'
                  ? 'opacity-0 transition duration-300 group-hover:opacity-100'
                  : ''
              }`}
            >
              <div className="text-md min-w-max font-bold">
                {user?.displayName || user?.email || 'Not logged in'}
              </div>
              {user?.username && (
                <div className="min-w-max text-sm font-semibold text-blue-300">
                  @{user?.username}
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

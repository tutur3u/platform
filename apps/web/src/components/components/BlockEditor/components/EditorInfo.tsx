import Tooltip from '../../ui/Tooltip';
import { EditorUser } from '../types';
import { cn } from '@/lib/utils';
import { useStatus } from '@liveblocks/react/suspense';
import { memo } from 'react';

export type EditorInfoProps = {
  characters: number;
  words: number;
  users: EditorUser[];
};

export const EditorInfo = memo(
  ({ characters, users, words }: EditorInfoProps) => {
    const status = useStatus(); 


    const connectionText = 
      status === 'connected' 
        ? 'Connected' 
        : status === 'connecting' 
        ? 'Connecting...' 
        : 'Disconnected';


    const statusColor = 
      status === 'connected'
        ? 'bg-green-500 dark:bg-green-400'
        : status === 'connecting'
        ? 'bg-yellow-500 dark:bg-yellow-400'
        : 'bg-red-500 dark:bg-red-400';

    return (
      <div className="flex items-center">
        <div className="mr-4 flex flex-col justify-center border-r border-neutral-200 pr-4 text-right dark:border-neutral-800">
          <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            {words} {words === 1 ? 'word' : 'words'}
          </div>
          <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            {characters} {characters === 1 ? 'character' : 'characters'}
          </div>
        </div>
        <div className="mr-2 flex items-center gap-2">
          <div className={cn('h-2 w-2 rounded-full', statusColor)} />
          <span className="max-w-[4rem] text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            {connectionText}
          </span>
        </div>
        {status === 'connected' && (
          <div className="flex flex-row items-center">
            <div className="relative ml-3 flex flex-row items-center">
              {users.slice(0, 3).map((user: EditorUser) => (
                <div key={user.clientId} className="-ml-3">
                  <Tooltip title={user.name}>
                    <img
                      className="h-8 w-8 rounded-full border border-white dark:border-black"
                      src={`https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${user.name}&backgroundColor=${user.color.replace('#', '')}`}
                      alt="avatar"
                    />
                  </Tooltip>
                </div>
              ))}
              {users.length > 3 && (
                <div className="-ml-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white bg-[#FFA2A2] text-xs font-bold leading-none dark:border-black">
                    +{users.length - 3}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

EditorInfo.displayName = 'EditorInfo';

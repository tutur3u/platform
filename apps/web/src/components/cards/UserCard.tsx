import { User } from '@ncthub/types/primitives/User';
import { Separator } from '@ncthub/ui/separator';
import moment from 'moment';
import Link from 'next/link';

interface Props {
  user: User;
}

const UserCard = ({ user }: Props) => {
  return (
    <Link
      href={user?.handle ? `/users/${user.handle}` : '#'}
      className="border-border group flex cursor-pointer flex-col items-center justify-center rounded-lg border bg-zinc-500/5 text-center transition hover:bg-zinc-500/10 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {user.display_name}
          </div>
          <div className="line-clamp-1 font-semibold text-blue-600 dark:text-blue-300">
            @{user?.handle || 'Chưa có handle'}
          </div>
        </div>
      </div>

      <Separator className="border-border w-full dark:border-zinc-700" />

      <div className="m-2 h-full w-full px-2">
        <div className="flex h-full items-center justify-center rounded border border-green-500/20 bg-green-500/10 p-2 font-semibold text-green-600 dark:border-green-300/20 dark:bg-green-300/10 dark:text-green-300">
          Created at {moment(user?.created_at).format('HH:mm, DD/MM/YYYY')}
        </div>
      </div>
    </Link>
  );
};

export default UserCard;

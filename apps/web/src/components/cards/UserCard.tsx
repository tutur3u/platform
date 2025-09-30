import type { User } from '@tuturuuu/types/primitives/User';
import { Separator } from '@tuturuuu/ui/separator';
import moment from 'moment';
import Link from 'next/link';

interface Props {
  user: User;
}

const UserCard = ({ user }: Props) => {
  return (
    <Link
      href={user?.handle ? `/users/${user.handle}` : '#'}
      className="group flex cursor-pointer flex-col items-center justify-center rounded-lg border border-border bg-foreground/5 text-center transition hover:bg-foreground/10"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {user.display_name}
          </div>
          <div className="line-clamp-1 font-semibold text-dynamic-blue">
            @{user?.handle || 'Chưa có handle'}
          </div>
        </div>
      </div>

      <Separator className="w-full border-border" />

      <div className="m-2 h-full w-full px-2">
        <div className="flex h-full items-center justify-center rounded border border-dynamic-green/20 bg-dynamic-green/10 p-2 font-semibold text-dynamic-green">
          Created at {moment(user?.created_at).format('HH:mm, DD/MM/YYYY')}
        </div>
      </div>
    </Link>
  );
};

export default UserCard;

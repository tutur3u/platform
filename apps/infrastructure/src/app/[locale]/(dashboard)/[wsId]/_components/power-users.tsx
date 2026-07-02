'use client';

import type { PowerUser } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { useTranslations } from 'next-intl';

interface Props {
  users: PowerUser[];
}

export default function PowerUsersComponent({ users }: Props) {
  const t = useTranslations('infrastructure-analytics');

  return (
    <div>
      <h3 className="font-semibold text-lg">{t('users.power-users-title')}</h3>
      <p className="text-muted-foreground text-sm">
        {t('users.power-users-description')}
      </p>
      <div className="mt-4 space-y-4">
        {users.map((user) => (
          <div
            key={user.user_id}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={user.avatar_url || ''} />
                <AvatarFallback>{user.username?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{user.username}</p>
                <p className="text-muted-foreground text-sm">
                  {t('users.actions', { count: user.action_count })}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-sm">
                {t('users.last-seen')}
              </p>
              <p className="font-medium text-sm">
                {new Date(user.last_seen).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

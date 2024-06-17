import AccountBadge from './account-badge';
import { useTimeBlocking } from './time-blocking-provider';
import { User as PlatformUser } from '@/types/primitives/User';
import { Button } from '@repo/ui/components/ui/button';
import { Separator } from '@repo/ui/components/ui/separator';
import useTranslation from 'next-translate/useTranslation';

export default function LoggedInAsButton({
  platformUser,
}: {
  platformUser: PlatformUser | null;
}) {
  const { t } = useTranslation('meet-together-plan-details');
  const { user: guestUser, setDisplayMode } = useTimeBlocking();

  const user = guestUser ?? platformUser;

  return (
    <div className="bg-foreground/5 border-foreground/20 w-full rounded border p-2 text-center md:w-fit md:min-w-64">
      <div className="text-sm opacity-80">
        {user?.id ? t('interacting_as') : t('viewing_as')}
      </div>
      <div
        className={`${user?.id ? '' : 'opacity-50'} line-clamp-1 break-all font-semibold`}
      >
        {user?.display_name || platformUser?.email || t('anonymous')}{' '}
      </div>

      {user?.id ? (
        <AccountBadge
          type={
            user?.is_guest === true
              ? 'GUEST'
              : !!platformUser?.id
                ? 'PLATFORM'
                : 'GUEST'
          }
        />
      ) : null}
      <Separator className="bg-foreground/20 my-2" />
      <Button
        className="w-full"
        onClick={() => {
          setDisplayMode('account-switcher');
        }}
      >
        {user?.id ? t('switch_account') : t('common:login')}
      </Button>
    </div>
  );
}

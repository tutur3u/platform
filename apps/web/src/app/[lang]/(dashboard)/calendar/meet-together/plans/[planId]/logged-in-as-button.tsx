import useTranslation from 'next-translate/useTranslation';
import { useTimeBlocking } from './time-blocking-provider';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { User as PlatformUser } from '@/types/primitives/User';
import AccountBadge from './account-badge';

export default function LoggedInAsButton({
  platformUser,
}: {
  platformUser: PlatformUser | null;
}) {
  const { t } = useTranslation('meet-together-plan-details');
  const {
    user: guestUser,
    setShowLogin,
    setShowAccountSwitcher,
  } = useTimeBlocking();

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
          setShowLogin(true);
          setShowAccountSwitcher(true);
        }}
      >
        {user?.id ? t('switch_account') : t('common:login')}
      </Button>
    </div>
  );
}

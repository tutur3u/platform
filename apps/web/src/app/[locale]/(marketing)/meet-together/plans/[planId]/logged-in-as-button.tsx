import AccountBadge from './account-badge';
import { useTimeBlocking } from './time-blocking-provider';
import { User as PlatformUser } from '@tuturuuu/types/primitives/User';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';

export default function LoggedInAsButton({
  platformUser,
}: {
  platformUser: PlatformUser | null;
}) {
  const t = useTranslations();
  const { user: guestUser, setDisplayMode } = useTimeBlocking();

  const user = guestUser ?? platformUser;

  return (
    <div className="border-foreground/20 bg-foreground/5 w-full rounded border p-2 text-center md:w-fit md:min-w-64">
      <div className="text-sm opacity-80">
        {user?.id
          ? t('meet-together-plan-details.interacting_as')
          : t('meet-together-plan-details.viewing_as')}
      </div>
      <div
        className={`${user?.id ? '' : 'opacity-50'} line-clamp-1 break-all font-semibold`}
      >
        {user?.display_name ||
          platformUser?.email ||
          t('meet-together-plan-details.anonymous')}{' '}
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
        {user?.id
          ? t('meet-together-plan-details.switch_account')
          : t('common.login')}
      </Button>
    </div>
  );
}

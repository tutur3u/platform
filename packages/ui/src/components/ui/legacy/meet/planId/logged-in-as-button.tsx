import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import AccountBadge from './account-badge';

export default function LoggedInAsButton() {
  const t = useTranslations();
  const {
    user: guestUser,
    originalPlatformUser,
    setDisplayMode,
  } = useTimeBlocking();

  const user = guestUser ?? originalPlatformUser;

  return (
    <div className="w-full rounded border border-foreground/20 bg-foreground/5 p-2 text-center md:w-fit md:min-w-64">
      <div className="text-sm opacity-80">
        {user?.id
          ? t('meet-together-plan-details.interacting_as')
          : t('meet-together-plan-details.viewing_as')}
      </div>
      <div
        className={`${user?.id ? '' : 'opacity-50'} line-clamp-1 break-all font-semibold`}
      >
        {user?.display_name ||
          originalPlatformUser?.email ||
          t('meet-together-plan-details.anonymous')}{' '}
      </div>

      {user?.id ? (
        <AccountBadge
          type={
            user?.is_guest === true
              ? 'GUEST'
              : originalPlatformUser?.id
                ? 'PLATFORM'
                : 'GUEST'
          }
        />
      ) : null}
      <Separator className="my-2 bg-foreground/20" />
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

import AccountBadge from './account-badge';
import { useTimeBlocking } from './time-blocking-provider';
import type { User as PlatformUser } from '@tuturuuu/types/primitives/User';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function LoggedInAsButton({
  platformUser,
}: {
  platformUser: PlatformUser | null;
}) {
  const t = useTranslations();
  const {
    user: guestUser,
    setDisplayMode,
    isDirty,
    syncTimeBlocks,
    clearDirtyState,
  } = useTimeBlocking();
  const [isSaving, setIsSaving] = useState(false);

  // Handle manual save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await syncTimeBlocks();
      clearDirtyState();
    } catch (error) {
      console.error('Failed to save timeblocks:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const user = guestUser ?? platformUser;

  return (
    <div className="w-full rounded border border-foreground/20 bg-foreground/5 p-2 text-center md:w-fit md:min-w-64">
      <div className="text-sm opacity-80">
        {user?.id
          ? t('meet-together-plan-details.interacting_as')
          : t('meet-together-plan-details.viewing_as')}
      </div>
      <div
        className={`${user?.id ? '' : 'opacity-50'} line-clamp-1 font-semibold break-all`}
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
              : platformUser?.id
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
      <Button
        className="mt-2 w-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 text-white shadow-md hover:from-sky-600 hover:via-blue-600 hover:to-indigo-600 focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:outline-none active:scale-100 disabled:cursor-not-allowed disabled:from-gray-400 disabled:via-gray-400 disabled:to-gray-400"
        onClick={handleSave}
        disabled={!isDirty || isSaving}
      >
        {isSaving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
}

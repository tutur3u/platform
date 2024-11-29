import { LanguageWrapper } from './language-wrapper';
import NotificationPopover from './notification-popover';
import { ThemeToggle } from './theme-toggle';
import { UserNavWrapper } from './user-nav-wrapper';
import GetStartedButton from '@/components/layouts/GetStartedButton';
import { createClient } from '@/utils/supabase/server';

export default async function NavbarActions({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const supabase = await createClient();

  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {sbUser ? (
          <>
            <UserNavWrapper hideMetadata={hideMetadata} />
            <NotificationPopover />
          </>
        ) : (
          <>
            <GetStartedButton />
            <LanguageWrapper />
            {/* <ThemeToggle /> */}
          </>
        )}
      </div>
    </div>
  );
}

import NotificationPopover from './notification-popover';
import { ThemeToggle } from './theme-toggle';
import { UserNavWrapper } from './user-nav-wrapper';
import GetStartedButton from '@/components/layouts/GetStartedButton';
import { createClient } from '@/utils/supabase/server';

export default async function NavbarActions() {
  const supabase = createClient();

  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();

  return (
    <div className="flex items-center gap-2">
      {sbUser ? (
        <>
          <NotificationPopover />
          <UserNavWrapper />
        </>
      ) : (
        <>
          <GetStartedButton />
          <ThemeToggle />
        </>
      )}
    </div>
  );
}

import LogoTitle from './logo-title';
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
    <div className="relative">
      <div className="absolute inset-y-0 right-0 flex items-center gap-1">
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
      <div className="pointer-events-none hidden flex-none items-center gap-2 text-transparent md:flex">
        <div className="h-8 w-8" />
        <LogoTitle />
      </div>
    </div>
  );
}

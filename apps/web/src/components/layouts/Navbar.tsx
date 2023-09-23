import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import NotificationPopover from '@/app/(dashboard)/[wsId]/_components/notification-popover';
import { UserNav } from '@/app/(dashboard)/[wsId]/_components/user-nav';

export const dynamic = 'force-dynamic';

const Navbar = async () => {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const getStarted = 'Get started';

  return (
    <nav className="border-foreground/10 bg-background/80 fixed inset-x-0 top-0 z-10 flex items-center justify-between border-b px-4 py-2 font-semibold backdrop-blur-lg md:px-32 lg:px-64">
      <Link href="/" className="flex items-center gap-2">
        <Image
          src="/media/logos/transparent.png"
          width={320}
          height={320}
          alt="logo"
          className="h-7 w-7"
        />
        <div className="text-xl text-black hover:text-zinc-700 dark:text-white dark:hover:text-zinc-200">
          Tuturuuu
        </div>
      </Link>

      <>
        {user ? (
          <div className="flex items-center gap-2">
            <NotificationPopover />
            <UserNav />
          </div>
        ) : (
          <Link
            href="/login"
            className="border-foreground/10 bg-foreground/10 hover:bg-foreground/5 rounded-full border px-4 py-1 transition duration-300"
          >
            {getStarted}
          </Link>
        )}
      </>
    </nav>
  );
};

export default Navbar;

import { Navigation } from '@/components/navigation';
import { Separator } from '@/components/ui/separator';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const navLinks = [
    {
      name: 'Account',
      href: '/settings/account',
    },
    {
      name: 'Appearance',
      href: '/settings/appearance',
    },
    {
      name: 'Notifications',
      href: '/settings/notifications',
    },
    {
      name: 'Workspaces',
      href: '/settings/workspaces',
    },
    {
      name: 'Activities',
      href: '/settings/activities',

      // Only allow user that has email ends with @tuturuuu.com
      disabled: !user?.email?.endsWith('@tuturuuu.com'),
    },
  ];

  return (
    <>
      <div className="p-4 pb-2 font-semibold md:px-8 lg:px-16 xl:px-32">
        <Link href="/" className="mb-2 flex items-center gap-2">
          <Image
            src="/media/logos/transparent.png"
            width={320}
            height={320}
            alt="logo"
            className="h-7 w-7"
          />
          <div className="text-2xl text-black hover:text-zinc-700 dark:text-white dark:hover:text-zinc-200">
            Tuturuuu
          </div>
        </Link>

        <div className="flex gap-1">
          <Navigation navLinks={navLinks} />
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-center p-4 md:px-8 lg:px-16 xl:px-32">
        {children}
      </div>
    </>
  );
}

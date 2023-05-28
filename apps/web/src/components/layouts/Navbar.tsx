import Image from 'next/image';
import Link from 'next/link';
import { useUser } from '@supabase/auth-helpers-react';
import UserProfilePopover from './UserProfilePopover';
import useTranslation from 'next-translate/useTranslation';
import { Bars3Icon } from '@heroicons/react/24/solid';
import { Popover } from '@mantine/core';
import { useState } from 'react';

interface NavbarProps {
  hideNavLinks?: boolean;
}

const Navbar = ({ hideNavLinks }: NavbarProps) => {
  const { t } = useTranslation();

  const user = useUser();

  const login = t('common:login');
  const getStarted = t('common:get-started');

  const [opened, setOpened] = useState(false);

  const toggle = () => setOpened((o) => !o);
  const close = () => setOpened(false);

  return (
    <nav className="fixed inset-x-0 top-0 z-10 flex items-center justify-between border-b p-4 font-semibold backdrop-blur-lg dark:border-zinc-800 dark:bg-[#111113]/80 dark:text-white md:px-32 lg:px-64">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2">
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
      </div>

      {hideNavLinks ? null : user ? (
        <UserProfilePopover />
      ) : (
        <>
          <div className="hidden items-center gap-4 md:flex">
            <Link
              href="/login"
              className="hover:text-blue-600 dark:hover:text-blue-200"
            >
              {login}
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-blue-500/10 bg-blue-500/10 px-4 py-1 text-blue-500 transition duration-300 hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/20 dark:text-blue-300 dark:hover:bg-blue-300/30"
            >
              {getStarted}
            </Link>
          </div>

          <Popover
            opened={opened}
            onChange={setOpened}
            width={200}
            offset={8}
            position="top-end"
          >
            <Popover.Target>
              <button
                className="rounded p-1 hover:bg-zinc-300/10 md:hidden"
                onClick={toggle}
              >
                <Bars3Icon className="h-6 w-6" />
              </button>
            </Popover.Target>

            <Popover.Dropdown className="grid gap-2 p-2">
              <Link
                href="/login"
                onClick={close}
                className="rounded border border-zinc-300/10 bg-zinc-300/10 p-2 text-center font-semibold transition hover:bg-zinc-300/20"
              >
                {login}
              </Link>
              <Link
                href="/signup"
                onClick={close}
                className="rounded border border-blue-300/20 bg-blue-300/20 p-2 text-center font-semibold text-blue-300 transition hover:bg-blue-300/30"
              >
                {getStarted}
              </Link>
            </Popover.Dropdown>
          </Popover>
        </>
      )}
    </nav>
  );
};

export default Navbar;

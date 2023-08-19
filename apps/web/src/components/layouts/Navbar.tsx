import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import LogoutButton from '../LogoutButton';

const Navbar = async () => {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const getStarted = 'Get started';

  // const [opened, setOpened] = useState(false);

  // const toggle = () => setOpened((o) => !o);
  // const close = () => setOpened(false);

  return (
    <nav className="border-foreground/10 bg-background/80 fixed inset-x-0 top-0 z-10 flex items-center justify-between border-b p-4 font-semibold backdrop-blur-lg md:px-32 lg:px-64">
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

      <>
        {user ? (
          <div className="grid text-right">
            <div className="opacity-50">{user.email}</div>
            <div className="flex gap-2">
              <Link href="/onboarding">Dashboard</Link>
              <LogoutButton />
            </div>
          </div>
        ) : (
          <Link
            href="/login"
            className="border-foreground/10 bg-foreground/10 hover:bg-foreground/5 rounded-full border px-4 py-1 transition duration-300"
          >
            {getStarted}
          </Link>
        )}

        {/* <Popover
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
          </Popover> */}
      </>
    </nav>
  );
};

export default Navbar;

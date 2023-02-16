import Image from 'next/image';
import Link from 'next/link';
import { useUserData } from '../../hooks/useUserData';
import dynamic from 'next/dynamic';

interface NavbarProps {
  hideNavLinks?: boolean;
}

const UserProfilePopover = dynamic(() => import('./UserProfilePopover'));

const Navbar = ({ hideNavLinks }: NavbarProps) => {
  const { data: user } = useUserData();

  return (
    <nav className="fixed inset-x-0 top-0 z-10 flex items-center justify-between border-b border-zinc-700 bg-zinc-800/50 p-4 font-semibold text-white backdrop-blur-lg md:px-32 lg:px-64">
      <Link href="/" className="flex gap-2 transition hover:text-blue-200">
        <Image
          src="/media/logos/transparent.png"
          width={320}
          height={320}
          alt="logo"
          className="w-8"
        />
        <div className="text-2xl">Tuturuuu</div>
      </Link>

      {hideNavLinks ? null : user ? (
        <UserProfilePopover user={user} />
      ) : (
        <div className="flex items-center gap-4">
          <Link href="/login" className="hover:text-blue-200">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-blue-300/20 px-4 py-1 text-blue-300 transition duration-300 hover:bg-blue-300/30 hover:text-blue-200"
          >
            Get Started
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;

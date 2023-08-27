import { Navigation } from '@/components/navigation';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import Link from 'next/link';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  const navLinks = [
    {
      name: 'Home',
      href: '/',
      matchExact: true,
    },
    {
      name: 'Chat',
      href: '/chat',
    },
    {
      name: 'Dashboard',
      href: '/onboarding',
      matchExact: true,
    },
  ];

  return (
    <>
      <div className="p-4 font-semibold md:px-8 lg:px-16 xl:px-32">
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

      <div className="p-4 md:px-8 lg:px-16 xl:px-32">{children}</div>
    </>
  );
}

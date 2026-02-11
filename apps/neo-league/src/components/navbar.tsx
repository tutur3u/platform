import { Button } from '@ncthub/ui/button';
import { Navbar as SharedNavbar } from '@ncthub/ui/navbar';
import Link from 'next/dist/client/link';
import Image from 'next/image';
import NavbarSeparator from './navbar-separator';

export default async function Navbar() {
  return (
    <SharedNavbar
      customLogoLink={
        <Link href="/" className="flex flex-none items-center gap-2">
          <Image
            src="/monkey-mascot.png"
            className="h-20 w-auto"
            width={350}
            height={100}
            alt="NEO League Logo"
          />
        </Link>
      }
      separator={<NavbarSeparator />}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="hover:bg-transparent hover:text-foreground/50"
            asChild
          >
            <Link href="#handbook">See Handbook</Link>
          </Button>
          <Button
            variant="ghost"
            className="hover:bg-transparent hover:text-foreground/50"
            asChild
          >
            <Link href="#contact">Contact Us</Link>
          </Button>
          <Button asChild className="btn-primary">
            <Link href="#register">Register Now</Link>
          </Button>
        </div>
      }
    />
  );
}

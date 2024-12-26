import { ThemeToggle } from '@/components/playground/theme-toggle';
import { Button } from '@repo/ui/components/ui/button';
import Link from 'next/link';

export function Navbar() {
  return (
    <nav className="bg-background border-b">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="text-primary text-xl font-bold">
          Prompt Engineering Playground
        </Link>
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button variant="ghost">Home</Button>
          </Link>
          <Link href="/challenges">
            <Button variant="ghost">Challenges</Button>
          </Link>
          <Link href="/playground">
            <Button variant="ghost">Playground</Button>
          </Link>
          <Link href="/leaderboard">
            <Button variant="ghost">Leaderboard</Button>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

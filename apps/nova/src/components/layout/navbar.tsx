import { useRouter } from 'next/router'; 
import { ThemeToggle } from '@/components/playground/theme-toggle';
import { Button } from '@repo/ui/components/ui/button';
import Link from 'next/link';

export function Navbar() {
  const router = useRouter();
  const { wsId } = router.query; 

  return (
    <nav className="bg-background border-b">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <Link href={`/${wsId}/`} className="text-primary text-xl font-bold">
          Prompt Engineering Playground
        </Link>
        <div className="flex items-center space-x-4">
          <Link href={`/${wsId}/`}>
            <Button variant="ghost">Home</Button>
          </Link>
          <Link href={`/${wsId}/challenges`}>
            <Button variant="ghost">Challenges</Button>
          </Link>
          <Link href={`/${wsId}/playground`}>
            <Button variant="ghost">Playground</Button>
          </Link>
          <Link href={`/${wsId}/leaderboard`}>
            <Button variant="ghost">Leaderboard</Button>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

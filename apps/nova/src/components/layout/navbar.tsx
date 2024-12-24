import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/playground/theme-toggle'

export function Navbar() {
  return (
    <nav className="bg-background border-b">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-primary">
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
  )
}


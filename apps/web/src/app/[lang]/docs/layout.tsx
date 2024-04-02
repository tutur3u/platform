import { HomeIcon, Play } from 'lucide-react';
import Link from 'next/link';
import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-full w-full items-center">
      <div className="flex h-full w-96 flex-col gap-2 border-r p-8">
        <Link
          href="/docs"
          className="flex items-center gap-2 opacity-80 hover:opacity-100"
        >
          <HomeIcon className="h-4 w-4" />
          Home
        </Link>
        <Link
          href="/docs/getting-started"
          className="flex items-center gap-2 opacity-80 hover:opacity-100"
        >
          <Play className="h-4 w-4" />
          Getting Started
        </Link>
      </div>

      <div className="h-full w-full p-8">{children}</div>
    </div>
  );
}

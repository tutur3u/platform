'use client';

import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@repo/ui/components/ui/button';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export function AuthButton({
  user,
  onClick,
  className,
}: {
  user: User | null;
  onClick?: () => void;
  className?: string;
}) {
  const supabase = createClient();

  const signOut = async () => {
    await supabase.auth.signOut();
    return redirect('/login');
  };

  return user ? (
    <div className="grid gap-2">
      <div className="break-all">
        <div className="text-xs">Logged in as</div>
        <div className="line-clamp-1 text-sm font-semibold">{user.email}</div>
      </div>
      <form action={signOut}>
        <Button
          onClick={onClick}
          variant="destructive"
          className={cn('w-full', className)}
        >
          Logout
        </Button>
      </form>
    </div>
  ) : (
    <Link
      href="/login"
      onClick={onClick}
      className={cn(
        'border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue hover:bg-brand-light-blue/10 flex rounded-md border px-4 py-2 font-semibold no-underline transition',
        className
      )}
    >
      Login
    </Link>
  );
}

'use client';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cn } from '@/lib/utils';
import { User } from '@supabase/supabase-js';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function AuthButton({
  user,
  onClick,
  className,
}: {
  user: User | null;
  onClick?: () => void;
  className?: string;
}) {
  const supabase = createClientComponentClient();

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
        <button
          onClick={onClick}
          className={cn(
            'border-brand-light-red/10 bg-brand-light-red/10 text-brand-light-red hover:bg-brand-light-red/20 rounded-md border px-2 py-1 font-semibold no-underline transition',
            className
          )}
        >
          Logout
        </button>
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

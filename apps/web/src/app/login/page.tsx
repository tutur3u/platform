import Link from 'next/link';
import { cookies } from 'next/headers';
import LoginForm from './form';
import { Separator } from '@/components/ui/separator';
import { SparklesIcon } from '@heroicons/react/20/solid';
import Image from 'next/image';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Login() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/ai');

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center p-8">
      <Link
        href="/"
        className="text-foreground bg-btn-background hover:bg-btn-background-hover group absolute left-8 top-8 flex items-center rounded-md px-4 py-2 text-sm no-underline"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>{' '}
        Back
      </Link>

      <div className="grid gap-2 sm:max-w-md">
        <div className="flex items-center justify-center">
          <h1 className="relative w-fit">
            <span className="text-4xl font-bold lg:text-7xl">Rewise</span>
            <SparklesIcon className="absolute -top-1 right-0 h-4 text-amber-300 lg:top-0 lg:h-6" />
            <span className="text-foreground flex items-center justify-center gap-2 text-lg lg:text-2xl">
              <span className="text-lg opacity-70">by </span>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 font-semibold hover:underline"
              >
                Tuturuuu
                <Image
                  src="/media/logos/transparent.png"
                  width={24}
                  height={24}
                  className="translate-y-0.5"
                  alt="logo"
                />
              </Link>
            </span>
          </h1>
        </div>

        <LoginForm />

        <Separator className="mt-2" />
        <div className="text-center text-sm font-semibold text-zinc-300/60">
          By continuing, you agree to Tuturuuu&apos;s{' '}
          <Link
            href="/terms"
            className="text-zinc-200/80 underline decoration-zinc-200/80 underline-offset-2 transition hover:text-white hover:decoration-white"
          >
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            className="text-zinc-200/80 underline decoration-zinc-200/80 underline-offset-2 transition hover:text-white hover:decoration-white"
          >
            Privacy Policy
          </Link>{' '}
          to receive periodic emails with updates.
        </div>
      </div>
    </div>
  );
}

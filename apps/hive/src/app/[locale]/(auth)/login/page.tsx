import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { HIVE_APP_URL, WEB_APP_URL } from '@/constants/common';

type Props = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const t = await getTranslations('auth');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nextPath = params.next?.startsWith('/') ? params.next : '/';

  if (user) {
    redirect(nextPath);
  }

  const returnUrl = new URL('/verify-token', HIVE_APP_URL);
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', WEB_APP_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());
  loginUrl.searchParams.set('provider', 'hive');

  return (
    <main className="grid min-h-dvh bg-zinc-950 text-zinc-50 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex min-h-[55dvh] flex-col justify-between p-6 md:p-10">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold uppercase tracking-[0.16em]">
            Hive
          </span>
          <span className="text-zinc-400">{t('researchLab')}</span>
        </div>
        <div className="max-w-3xl space-y-6">
          <h1 className="text-balance font-semibold text-5xl leading-[0.95] tracking-tight md:text-7xl">
            {t('title')}
          </h1>
          <p className="max-w-2xl text-lg text-zinc-300 leading-8">
            {t('description')}
          </p>
          <a
            className="inline-flex min-h-11 items-center rounded-full bg-lime-300 px-5 font-semibold text-zinc-950 transition hover:bg-lime-200"
            href={loginUrl.toString()}
          >
            {t('continueWithTuturuuu')}
          </a>
        </div>
        <p className="max-w-xl text-sm text-zinc-500">{t('restricted')}</p>
      </section>
      <section className="relative hidden overflow-hidden border-zinc-800 border-l bg-zinc-900 lg:block">
        <div className="absolute inset-10 grid grid-cols-4 grid-rows-4 gap-3">
          {Array.from({ length: 16 }).map((_, index) => (
            <div
              className="rounded-md border border-zinc-700 bg-zinc-800 shadow-2xl shadow-zinc-950/30"
              key={index}
              style={{
                transform: `translateY(${(index % 3) * 10}px)`,
              }}
            />
          ))}
        </div>
        <div className="absolute right-16 bottom-16 rounded-3xl border border-lime-200/20 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur">
          <p className="font-semibold text-lime-200">{t('experimentTitle')}</p>
          <p className="mt-2 max-w-xs text-sm text-zinc-400">
            {t('experimentBody')}
          </p>
        </div>
      </section>
    </main>
  );
}

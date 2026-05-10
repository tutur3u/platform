import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

export default async function NotWhitelistedPage() {
  const t = await getTranslations('auth');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 p-6 text-zinc-50">
      <section className="w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl shadow-zinc-950/40">
        <p className="font-semibold text-lime-200 uppercase tracking-[0.14em]">
          Hive
        </p>
        <h1 className="mt-5 font-semibold text-3xl tracking-tight">
          {t('notWhitelistedTitle')}
        </h1>
        <p className="mt-3 text-zinc-400 leading-7">
          {t('notWhitelistedBody')}
        </p>
        <form action="/api/auth/logout" className="mt-8" method="post">
          <button
            className="min-h-11 rounded-full border border-zinc-700 px-5 font-medium text-zinc-100 transition hover:border-zinc-500"
            type="submit"
          >
            {t('logout')}
          </button>
        </form>
      </section>
    </main>
  );
}

import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { HIVE_APP_URL, WEB_APP_URL } from '@/constants/common';
import { HiveLandingWorld } from './landing-world';

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
    <main className="min-h-dvh bg-[#f4f0df] text-zinc-950">
      <section className="grid min-h-dvh lg:grid-cols-[0.8fr_1.2fr]">
        <div className="flex min-h-[48dvh] flex-col justify-between border-zinc-200 border-r bg-white/72 p-6 shadow-xl shadow-zinc-900/5 backdrop-blur md:p-10">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div>
              <p className="font-semibold text-xl">Hive</p>
              <p className="text-zinc-500">{t('researchLab')}</p>
            </div>
            <span className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-500">
              {t('softPerspective')}
            </span>
          </div>
          <div className="max-w-2xl space-y-6">
            <h1 className="text-balance font-semibold text-5xl leading-[0.95] tracking-tight md:text-7xl">
              {t('title')}
            </h1>
            <p className="max-w-xl text-lg text-zinc-600 leading-8">
              {t('description')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                className="inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-5 font-semibold text-white transition hover:bg-emerald-800"
                href={loginUrl.toString()}
              >
                {t('continueWithTuturuuu')}
              </a>
              <span className="rounded-lg border border-zinc-200 bg-white/80 px-4 py-3 text-sm text-zinc-500">
                {t('manualRuns')}
              </span>
            </div>
          </div>
          <p className="max-w-xl text-sm text-zinc-500">{t('restricted')}</p>
        </div>
        <div className="relative min-h-[560px] overflow-hidden">
          <HiveLandingWorld
            dockLabels={[
              t('grass'),
              t('path'),
              t('water'),
              t('house'),
              t('tree'),
              t('erase'),
            ]}
            toolbarLabels={[t('softPerspective'), t('npcLab'), t('worldState')]}
          />
        </div>
      </section>
    </main>
  );
}

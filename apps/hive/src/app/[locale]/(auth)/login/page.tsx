import { getAppSessionClaimsFromRequest } from '@tuturuuu/auth/app-session';
import { ArrowRight, Bot, Box, Radio, ShieldCheck } from '@tuturuuu/icons';
import { headers } from 'next/headers';
import Image from 'next/image';
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
  const appSession = getAppSessionClaimsFromRequest(
    { headers: await headers() },
    { targetApp: 'hive' }
  );

  const nextPath = params.next?.startsWith('/') ? params.next : '/';

  if (appSession) {
    redirect(nextPath);
  }

  const returnUrl = new URL('/verify-token', HIVE_APP_URL);
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', WEB_APP_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());
  loginUrl.searchParams.set('provider', 'hive');

  const proofPoints = [
    { icon: ShieldCheck, label: t('secureSession'), value: t('appSession') },
    { icon: Bot, label: t('npcLab'), value: t('agentRuntime') },
    { icon: Radio, label: t('worldState'), value: t('realtimeSync') },
  ];

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <section className="relative min-h-[82svh] overflow-hidden border-border border-b">
        <Image
          alt={t('previewAlt')}
          className="object-cover"
          fill
          priority
          sizes="100vw"
          src="/hive-landing-reference.png"
        />
        <div className="absolute inset-0 bg-linear-to-r from-background via-background/90 to-background/35" />
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent" />
        <div className="relative z-10 mx-auto flex min-h-[82svh] w-full max-w-7xl flex-col px-5 py-5 md:px-8 md:py-7">
          <nav className="flex items-center justify-between gap-4">
            <a
              className="inline-flex items-center gap-3 rounded-lg border border-border bg-background/80 px-3 py-2 backdrop-blur"
              href="/login"
            >
              <span className="grid h-9 w-9 place-items-center rounded-md bg-dynamic-green/15 text-dynamic-green">
                <Box className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-lg leading-none">
                  Hive
                </span>
                <span className="block text-muted-foreground text-xs">
                  {t('researchLab')}
                </span>
              </span>
            </a>
            <span className="hidden rounded-lg border border-border bg-background/80 px-3 py-2 text-muted-foreground text-sm backdrop-blur sm:inline-flex">
              {t('softPerspective')}
            </span>
          </nav>

          <div className="flex flex-1 items-center py-12 md:py-16">
            <div className="max-w-3xl">
              <p className="mb-4 inline-flex rounded-lg border border-dynamic-green/30 bg-dynamic-green/10 px-3 py-2 font-medium text-dynamic-green text-sm">
                {t('heroEyebrow')}
              </p>
              <h1 className="text-balance font-semibold text-5xl leading-none md:text-7xl">
                {t('title')}
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-8 md:text-xl">
                {t('description')}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-dynamic-green px-5 font-semibold text-background transition hover:bg-dynamic-green/90 focus:outline-none focus:ring-2 focus:ring-dynamic-green/35"
                  href={loginUrl.toString()}
                >
                  {t('continueWithTuturuuu')}
                  <ArrowRight className="h-4 w-4" />
                </a>
                <span className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background/80 px-4 text-muted-foreground text-sm backdrop-blur">
                  {t('restricted')}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-border border-t py-4 sm:grid-cols-3">
            {proofPoints.map(({ icon: Icon, label, value }) => (
              <div className="flex items-center gap-3" key={label}>
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-background/80 text-dynamic-green backdrop-blur">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block font-medium text-sm">{label}</span>
                  <span className="block text-muted-foreground text-xs">
                    {value}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-border border-b bg-muted/30 px-5 py-10 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
          <div>
            <p className="font-medium text-dynamic-blue text-sm">
              {t('studioKicker')}
            </p>
            <h2 className="mt-3 max-w-xl font-semibold text-3xl leading-tight md:text-5xl">
              {t('studioTitle')}
            </h2>
            <p className="mt-5 max-w-xl text-muted-foreground leading-7">
              {t('studioDescription')}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[t('grass'), t('path'), t('water'), t('house')].map((label) => (
                <span
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  key={label}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
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

'use client';

import { useGSAP } from '@gsap/react';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Heart,
  KeyRound,
  Mail,
  ShieldCheck,
  UsersRound,
  XIcon,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { TUTURUUU_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const heroImageUrl = 'https://picsum.photos/seed/tulearn-focus/1280/900';
const inlineImageUrl = 'https://picsum.photos/seed/tulearn-study/420/180';
const practiceImageUrl = 'https://picsum.photos/seed/tulearn-practice/960/960';
const reportsImageUrl = 'https://picsum.photos/seed/tulearn-reports/960/640';
const parentsImageUrl = 'https://picsum.photos/seed/tulearn-parents/960/640';
const webAppUrl =
  process.env.NEXT_PUBLIC_WEB_APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : 'http://localhost:7803');

type SocialProvider = 'google' | 'azure' | 'apple' | 'github';

const socialProviders = [
  {
    iconUrl: 'https://tuturuuu.com/media/google-logo.png',
    labelKey: 'auth.continueWithGoogle',
    name: 'Google',
    provider: 'google',
    type: 'image',
  },
  {
    iconUrl: 'https://tuturuuu.com/media/logos/microsoft.svg',
    labelKey: 'auth.continueWithMicrosoft',
    name: 'Microsoft',
    provider: 'azure',
    type: 'image',
  },
  {
    iconUrl: 'https://tuturuuu.com/media/logos/apple.svg',
    labelKey: 'auth.continueWithApple',
    name: 'Apple',
    provider: 'apple',
    type: 'mask',
  },
  {
    iconUrl: 'https://tuturuuu.com/media/logos/github.svg',
    labelKey: 'auth.continueWithGithub',
    name: 'GitHub',
    provider: 'github',
    type: 'mask',
  },
] as const satisfies {
  iconUrl: string;
  labelKey: string;
  name: string;
  provider: SocialProvider;
  type: 'image' | 'mask';
}[];

function normalizeNextPath(value: string) {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function SocialLogo({
  iconUrl,
  name,
  type,
}: {
  iconUrl: string;
  name: string;
  type: 'image' | 'mask';
}) {
  if (type === 'image') {
    return (
      <Image
        alt={name}
        className="object-contain transition-transform duration-200 group-hover:scale-110"
        height={20}
        src={iconUrl}
        unoptimized
        width={20}
      />
    );
  }

  return (
    <span
      aria-label={name}
      className="block size-5 shrink-0 bg-current transition-transform duration-200 group-hover:scale-110"
      role="img"
      style={{
        WebkitMaskImage: `url(${iconUrl})`,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskImage: `url(${iconUrl})`,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
      }}
    />
  );
}

async function postJson(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(data?.message || 'Request failed');
  }

  return response.json();
}

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const rootRef = useRef<HTMLElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const passwordLogin = useMutation({
    mutationFn: () => postJson('/api/auth/password-login', { email, password }),
    onError: (error) => setMessage(error.message),
    onSuccess: () => router.push(next),
  });

  const sendOtp = useMutation({
    mutationFn: () => postJson('/api/auth/send-otp', { email }),
    onError: (error) => setMessage(error.message),
    onSuccess: () => setMessage(t('auth.otpSent')),
  });

  const verifyOtp = useMutation({
    mutationFn: () => postJson('/api/auth/verify-otp', { email, otp }),
    onError: (error) => setMessage(error.message),
    onSuccess: () => router.push(next),
  });

  const handleSocialLogin = (provider: SocialProvider) => {
    const returnUrl = new URL('/verify-token', window.location.origin);
    returnUrl.searchParams.set('nextUrl', normalizeNextPath(next));

    const loginUrl = new URL('/login', webAppUrl);
    loginUrl.searchParams.set('returnUrl', returnUrl.toString());
    loginUrl.searchParams.set('provider', provider);

    window.location.assign(loginUrl.toString());
  };

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      if (reduceMotion) return;

      gsap.from('[data-login-nav]', {
        autoAlpha: 0,
        duration: 0.8,
        ease: 'power3.out',
        y: -18,
      });

      gsap.from('[data-hero-word]', {
        autoAlpha: 0,
        duration: 1,
        ease: 'power3.out',
        stagger: 0.045,
        y: 32,
      });

      gsap.from('[data-auth-panel]', {
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        scale: 0.96,
        y: 36,
      });

      gsap.from('[data-bento-card]', {
        autoAlpha: 0,
        duration: 0.75,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: {
          end: 'bottom 30%',
          scrub: 0.7,
          start: 'top 85%',
          trigger: '[data-bento-grid]',
        },
        y: 44,
      });

      gsap.fromTo(
        '[data-motion-image]',
        { autoAlpha: 0.35, scale: 0.82 },
        {
          autoAlpha: 1,
          ease: 'none',
          scale: 1,
          scrollTrigger: {
            end: 'bottom 20%',
            scrub: true,
            start: 'top 92%',
            trigger: '[data-motion-image]',
          },
        }
      );
    },
    { scope: rootRef }
  );

  return (
    <main
      ref={rootRef}
      className="min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground"
    >
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-30 bg-linear-to-b from-background via-background to-muted/30" />
        <div
          className="absolute top-10 left-[8%] -z-20 h-96 w-96 rounded-full bg-dynamic-green/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute top-20 right-[12%] -z-20 h-[28rem] w-[28rem] rounded-full bg-dynamic-blue/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute right-0 bottom-0 -z-10 h-[42rem] w-[42rem] translate-x-1/4 rounded-full bg-dynamic-orange/10 blur-3xl"
          aria-hidden="true"
        />

        <nav
          className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 pt-5 md:px-8 md:pt-8"
          data-login-nav
        >
          <div className="inline-flex items-center gap-3 rounded-full border border-border/70 bg-background/80 px-4 py-2 shadow-sm backdrop-blur-xl">
            <Image
              alt="Tuturuuu"
              className="size-9 rounded-full"
              height={36}
              src={TUTURUUU_LOGO_URL}
              unoptimized
              width={36}
            />
            <XIcon className="size-4 text-muted-foreground/60" />
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-dynamic-green text-primary-foreground">
              <BookOpen className="h-5 w-5" />
            </span>
            <div className="leading-none">
              <span className="block font-semibold text-lg">Learn</span>
              <span className="block text-muted-foreground text-xs">
                {t('auth.poweredByTuturuuu')}
              </span>
            </div>
          </div>
          <div className="hidden items-center gap-4 rounded-full border border-border/70 bg-background/70 px-5 py-3 text-muted-foreground text-sm backdrop-blur-xl md:flex">
            <span>{t('auth.navLearners')}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-dynamic-green" />
            <span>{t('auth.navParents')}</span>
          </div>
        </nav>

        <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-7xl grid-cols-1 items-center gap-12 px-5 py-20 md:grid-cols-[minmax(0,1fr)_minmax(23rem,27rem)] md:px-8 md:py-28">
          <div className="relative">
            <h1 className="max-w-5xl text-balance font-bold text-[clamp(3rem,7vw,6.2rem)] leading-[0.92] tracking-normal">
              <span data-hero-word>{t('auth.heroWord1')}</span>{' '}
              <span data-hero-word>{t('auth.heroWord2')}</span>{' '}
              <span
                aria-hidden="true"
                className="mx-2 inline-block h-[0.62em] w-[1.34em] translate-y-[0.08em] rounded-full bg-center bg-cover align-baseline shadow-lg ring-1 ring-border/60 contrast-125 grayscale"
                data-motion-image
                style={{ backgroundImage: `url(${inlineImageUrl})` }}
              />{' '}
              <span data-hero-word>{t('auth.heroWord3')}</span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg text-muted-foreground leading-8 md:text-xl">
              {t('auth.heroLead')}
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button
                className="h-12 rounded-full bg-dynamic-green px-6 text-primary-foreground hover:bg-dynamic-green/90"
                onClick={() => document.getElementById('email')?.focus()}
                type="button"
              >
                <Mail className="h-4 w-4" />
                {t('auth.startLearning')}
              </Button>
              <Button
                className="h-12 rounded-full border-border/80 bg-background/70 px-6"
                onClick={() =>
                  document
                    .getElementById('tulearn-login-panel')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                type="button"
                variant="outline"
              >
                <ShieldCheck className="h-4 w-4" />
                {t('auth.parentAccess')}
              </Button>
            </div>

            <div className="mt-14 grid max-w-2xl grid-cols-3 gap-px overflow-hidden rounded-3xl border border-border/70 bg-border/70">
              <div className="bg-background/80 p-5 backdrop-blur-xl">
                <p className="font-semibold text-2xl text-dynamic-green">
                  +25 XP
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t('auth.signalPractice')}
                </p>
              </div>
              <div className="bg-background/80 p-5 backdrop-blur-xl">
                <p className="font-semibold text-2xl text-dynamic-orange">5</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t('auth.signalHearts')}
                </p>
              </div>
              <div className="bg-background/80 p-5 backdrop-blur-xl">
                <p className="font-semibold text-2xl text-dynamic-blue">7</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t('auth.signalStreak')}
                </p>
              </div>
            </div>
          </div>

          <div className="relative" data-auth-panel id="tulearn-login-panel">
            <div
              className="absolute -top-14 -right-8 hidden h-48 w-48 rounded-[2rem] bg-center bg-cover shadow-2xl ring-1 ring-border/60 contrast-125 grayscale md:block"
              data-motion-image
              style={{ backgroundImage: `url(${heroImageUrl})` }}
            />
            <div className="relative w-full rounded-[2rem] border border-border/70 bg-card/90 p-6 shadow-2xl backdrop-blur-2xl md:p-7">
              <div className="mb-7">
                <h2 className="font-bold text-3xl tracking-normal">
                  {t('auth.formTitle')}
                </h2>
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border/70 bg-background/70 p-3">
                  <Image
                    alt="Tuturuuu"
                    className="size-10 rounded-full"
                    height={40}
                    src={TUTURUUU_LOGO_URL}
                    unoptimized
                    width={40}
                  />
                  <div>
                    <p className="font-semibold text-sm">
                      {t('auth.tuturuuuAccount')}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t('auth.socialLoginLead')}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-muted-foreground text-sm leading-6">
                  {t('auth.formSubtitle')}
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-3">
                  <Label htmlFor="email">{t('auth.email')}</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      className="h-12 rounded-2xl bg-background/70 pl-11"
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      value={email}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      className="h-12 rounded-2xl bg-background/70 pl-11"
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      value={password}
                    />
                  </div>
                </div>
              </div>

              <Button
                className="mt-6 h-12 w-full rounded-full bg-dynamic-green text-primary-foreground hover:bg-dynamic-green/90"
                disabled={passwordLogin.isPending}
                onClick={() => passwordLogin.mutate()}
              >
                {t('auth.login')}
                <ArrowRight className="h-4 w-4" />
              </Button>

              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input
                  aria-label={t('auth.otp')}
                  className="h-12 rounded-2xl bg-background/70"
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder={t('auth.otp')}
                  value={otp}
                />
                <Button
                  className="h-12 rounded-full px-5"
                  disabled={sendOtp.isPending || verifyOtp.isPending}
                  onClick={() => (otp ? verifyOtp.mutate() : sendOtp.mutate())}
                  type="button"
                  variant="secondary"
                >
                  {otp ? t('auth.submitCode') : t('auth.sendCode')}
                </Button>
              </div>

              {message ? (
                <p className="mt-4 rounded-2xl border border-border/70 bg-background/70 p-3 text-muted-foreground text-sm">
                  {message}
                </p>
              ) : null}

              <div className="relative my-6">
                <div className="h-px bg-border/70" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="bg-card px-3 text-muted-foreground text-xs">
                    {t('auth.or')}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {socialProviders.map((socialProvider) => (
                  <Button
                    className="group relative h-12 w-full rounded-2xl border-border/70 bg-background/70 font-medium shadow-sm transition-colors hover:bg-muted/50"
                    key={socialProvider.provider}
                    onClick={() => handleSocialLogin(socialProvider.provider)}
                    type="button"
                    variant="outline"
                  >
                    <span className="absolute left-4 flex items-center justify-center text-foreground">
                      <SocialLogo
                        iconUrl={socialProvider.iconUrl}
                        name={socialProvider.name}
                        type={socialProvider.type}
                      />
                    </span>
                    <span>{t(socialProvider.labelKey)}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-32 md:px-8 md:py-44">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <h2 className="max-w-4xl font-bold text-[clamp(2.4rem,5vw,5rem)] leading-none tracking-normal">
              {t('auth.bentoTitle')}
            </h2>
            <p className="max-w-md text-lg text-muted-foreground leading-8">
              {t('auth.bentoLead')}
            </p>
          </div>

          <div
            className="grid grid-flow-dense auto-rows-[13rem] grid-cols-1 gap-3 md:grid-cols-6"
            data-bento-grid
          >
            <article
              className="group relative overflow-hidden rounded-[2rem] border border-border/70 bg-card md:col-span-3 md:row-span-2"
              data-bento-card
            >
              <div
                className="absolute inset-0 bg-center bg-cover opacity-80 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
                style={{ backgroundImage: `url(${practiceImageUrl})` }}
              />
              <div className="absolute inset-0 bg-linear-to-t from-background via-background/60 to-background/10" />
              <div className="relative flex h-full flex-col justify-end p-7">
                <Heart className="mb-5 h-8 w-8 text-dynamic-orange" />
                <h3 className="font-bold text-3xl tracking-normal">
                  {t('auth.practiceCardTitle')}
                </h3>
                <p className="mt-3 max-w-md text-muted-foreground leading-7">
                  {t('auth.practiceCardBody')}
                </p>
              </div>
            </article>

            <article
              className="group relative overflow-hidden rounded-[2rem] border border-border/70 bg-dynamic-blue/10 p-7 md:col-span-3"
              data-bento-card
            >
              <div
                className="absolute inset-y-0 right-0 w-1/2 bg-center bg-cover opacity-35 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
                style={{ backgroundImage: `url(${reportsImageUrl})` }}
              />
              <div className="relative max-w-md">
                <ShieldCheck className="mb-5 h-8 w-8 text-dynamic-blue" />
                <h3 className="font-bold text-2xl tracking-normal">
                  {t('auth.reportsCardTitle')}
                </h3>
                <p className="mt-3 text-muted-foreground leading-7">
                  {t('auth.reportsCardBody')}
                </p>
              </div>
            </article>

            <article
              className="group relative overflow-hidden rounded-[2rem] border border-border/70 bg-dynamic-green/10 p-7 md:col-span-2"
              data-bento-card
            >
              <UsersRound className="mb-5 h-8 w-8 text-dynamic-green" />
              <h3 className="font-bold text-2xl tracking-normal">
                {t('auth.parentsCardTitle')}
              </h3>
              <p className="mt-3 text-muted-foreground leading-7">
                {t('auth.parentsCardBody')}
              </p>
            </article>

            <article
              className="group relative overflow-hidden rounded-[2rem] border border-border/70 bg-card md:col-span-1"
              data-bento-card
            >
              <div
                className="h-full w-full bg-center bg-cover opacity-80 contrast-125 grayscale transition-transform duration-700 ease-out group-hover:scale-105"
                style={{ backgroundImage: `url(${parentsImageUrl})` }}
              />
            </article>
          </div>
        </div>
      </section>

      <section className="px-5 pb-24 md:px-8 md:pb-36">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 border-border/70 border-t pt-10 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl font-semibold text-2xl tracking-normal">
            {t('auth.footerLine')}
          </p>
          <Button
            className="h-12 rounded-full bg-dynamic-green px-6 text-primary-foreground hover:bg-dynamic-green/90"
            onClick={() => document.getElementById('email')?.focus()}
            type="button"
          >
            {t('auth.startLearning')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </main>
  );
}

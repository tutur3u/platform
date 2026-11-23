'use client';

import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AppGlyph } from './continue-card-parts';

/**
 * The app a sign-in is for. `name` always comes from a server-validated
 * source (the external app registry or the static first-party domain list),
 * never from the query string; `logo` from the static list or the
 * same-origin proxy path for a registered logo.
 */
export type LoginBrandApp = {
  logo: string | null;
  name: string;
};

const HEADING_CLASS =
  'text-balance font-extrabold text-[28px] leading-[1.1] tracking-[-0.02em] sm:text-[32px] xl:text-[38px]';

function LogoImage({ label, src }: { label: string; src: string }) {
  return (
    <span
      aria-label={label}
      className="block size-12 bg-center xl:size-14 bg-contain bg-no-repeat"
      role="img"
      style={{ backgroundImage: `url(${src})` }}
    />
  );
}

/**
 * The app's logo, or the neutral glyph when it has none or the image fails,
 * so a missing logo never leaves a broken image in the header. Decorative:
 * the heading beside it names the app.
 */
function AppMark({ app }: { app: LoginBrandApp }) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  if (!app.logo || failedLogo === app.logo) {
    return <AppGlyph className="size-12 xl:size-14" />;
  }

  return (
    <img
      alt=""
      data-testid="login-app-logo"
      className="size-12 rounded-2xl object-contain xl:size-14"
      onError={() => setFailedLogo(app.logo)}
      src={app.logo}
    />
  );
}

/**
 * The column header: the requesting app's mark and "Sign in to {app}" for an
 * app sign-in, the Tuturuuu mark and welcome otherwise, or a fixed-size
 * placeholder while the app is still being verified.
 */
export function LoginBrandHeader({
  app,
  multiAccount,
  pending,
}: {
  app: LoginBrandApp | null;
  multiAccount: boolean;
  pending: boolean;
}) {
  const t = useTranslations();

  if (pending) {
    return (
      <div aria-hidden="true" className="flex flex-col items-center gap-4">
        <div className="size-12 animate-pulse rounded-2xl xl:size-14 bg-muted motion-reduce:animate-none" />
        <div className="h-8 w-64 max-w-full animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-48 max-w-full animate-pulse rounded-full bg-muted/70 motion-reduce:animate-none" />
      </div>
    );
  }

  if (app && !multiAccount) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <AppMark app={app} />
        <div className="flex flex-col gap-2">
          <h1 className={HEADING_CLASS}>
            {t('login.sign_in_to_app', { app: app.name })}
          </h1>
          <p className="text-balance text-[15px] text-muted-foreground leading-relaxed xl:text-base">
            {t('login.sign_in_to_app_subtitle', { app: app.name })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <LogoImage label="Tuturuuu" src={TUTURUUU_LOCAL_LOGO_URL} />
      <div className="flex flex-col gap-2">
        <h1 className={HEADING_CLASS}>
          {multiAccount
            ? t('account_switcher.add_account')
            : t('login.welcome_to_tuturuuu')}
        </h1>
        <p className="text-balance text-[15px] text-muted-foreground leading-relaxed xl:text-base">
          {multiAccount
            ? t('account_switcher.add_account_description')
            : t('login.sign_in_or_create')}
        </p>
      </div>
    </div>
  );
}

/**
 * "{app}'s sign-in is secured and powered by Tuturuuu": tells a visitor who
 * came from the app why they see Tuturuuu, without pulling focus. The app
 * name renders as text, so markup in a name is never interpreted.
 */
export function LoginAppDisclaimer({ appName }: { appName: string }) {
  const t = useTranslations('login');

  return (
    <p
      className="mx-auto max-w-[22rem] text-balance text-center text-muted-foreground text-xs leading-relaxed"
      data-testid="login-app-disclaimer"
    >
      <span
        aria-hidden="true"
        className="mr-1.5 inline-block size-3.5 bg-center bg-contain bg-no-repeat align-[-2px]"
        style={{ backgroundImage: `url(${TUTURUUU_LOCAL_LOGO_URL})` }}
      />
      {t('secured_by_tuturuuu', { app: appName })}
    </p>
  );
}

import { createClient } from '@tuturuuu/supabase/next/server';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { LanguageWrapper } from '@tuturuuu/ui/custom/language-wrapper';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { getTranslations } from 'next-intl/server';
import type { ComponentType } from 'react';
import { Suspense } from 'react';
import { LOCALE_COOKIE_NAME } from '../constants/common';
import { defaultLocale, supportedLocales } from '../i18n/routing';
import NotificationPopover from './notification-popover';

export function createNavbarActions(
  UserNav: ComponentType<{ hideMetadata?: boolean }>
) {
  return async function NavbarActions({
    hideMetadata = false,
  }: {
    hideMetadata?: boolean;
  }) {
    const t = await getTranslations();
    const supabase = await createClient();

    const {
      data: { user: sbUser },
    } = await supabase.auth.getUser();

    return (
      <div className="relative flex w-full">
        <div className="flex w-full flex-col gap-2">
          {/* Main actions row */}
          <div className="flex w-full items-center gap-1">
            {sbUser ? (
              <>
                <div className="flex-1">
                  <Suspense
                    fallback={
                      <div className="h-10 w-10 animate-pulse rounded-lg bg-foreground/5" />
                    }
                  >
                    <UserNav hideMetadata={hideMetadata} />
                  </Suspense>
                </div>
                <NotificationPopover />
              </>
            ) : (
              <>
                <GetStartedButton
                  text={t('common.get-started')}
                  href="/onboarding"
                />
                <LanguageWrapper
                  cookieName={LOCALE_COOKIE_NAME}
                  defaultLocale={defaultLocale}
                  supportedLocales={supportedLocales}
                />
                <ThemeToggle />
              </>
            )}
          </div>
        </div>
      </div>
    );
  };
}

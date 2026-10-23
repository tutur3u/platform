import { useRouter } from '@tanstack/react-router';
import { CallPreparation } from '@tuturuuu/meet-core/features/call/components/call-preparation';
import { JoinOutcome } from '@tuturuuu/meet-core/features/call/components/join-outcome';
import { NextIntlClientProvider } from 'next-intl';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

export function isRoomPath(pathname: string) {
  return /^\/(?:en\/|vi\/)?r\/[^/]+\/?$/u.test(pathname);
}

export function RoomRouteFeedback({
  pathname,
  state,
  onRetry,
}: {
  pathname: string;
  state: 'loading' | 'missing' | 'error';
  onRetry?: () => void;
}) {
  const locale = pathname.startsWith('/vi/') ? 'vi' : 'en';
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={locale === 'vi' ? vi : en}
    >
      {state === 'loading' ? (
        <CallPreparation leaveHref="/" />
      ) : (
        <JoinOutcome reason={state} onRetry={onRetry} />
      )}
    </NextIntlClientProvider>
  );
}

export function RoomRouteError({
  pathname,
  reset,
}: {
  pathname: string;
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <RoomRouteFeedback
      pathname={pathname}
      state="error"
      onRetry={() => {
        void router.invalidate().then(reset, reset);
      }}
    />
  );
}

'use client';

import { AlertTriangle, ArrowLeft, Home, RefreshCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';

type BoundaryError = Error & { digest?: string };

interface AppErrorBoundaryProps {
  appName?: string;
  error: BoundaryError;
  global?: boolean;
  homeHref?: string;
  locale?: string;
  reset?: () => void;
  unstable_retry?: () => void;
}

const COPY = {
  en: {
    badge: 'Recovery mode',
    back: 'Go back',
    description:
      'Your work is safe. Reload this view to continue, or return to a stable page.',
    details: 'Developer details',
    home: 'Go home',
    reference: 'Error reference',
    retry: 'Try again',
    title: 'This view could not load',
  },
  vi: {
    badge: 'Chế độ khôi phục',
    back: 'Quay lại',
    description:
      'Dữ liệu của bạn vẫn an toàn. Hãy tải lại giao diện này hoặc quay về một trang ổn định.',
    details: 'Chi tiết cho nhà phát triển',
    home: 'Về trang chính',
    reference: 'Mã tham chiếu lỗi',
    retry: 'Thử lại',
    title: 'Không thể tải giao diện này',
  },
} as const;

function resolveLocale(locale?: string) {
  if (locale?.toLowerCase().startsWith('vi')) return 'vi';
  if (locale?.toLowerCase().startsWith('en')) return 'en';

  if (typeof document !== 'undefined') {
    if (document.documentElement.lang.toLowerCase().startsWith('vi')) {
      return 'vi';
    }
  }

  if (typeof window !== 'undefined') {
    const firstSegment = window.location.pathname.split('/').filter(Boolean)[0];
    if (firstSegment === 'vi') return 'vi';
  }

  return 'en';
}

function RecoveryView({
  appName = 'Tuturuuu',
  error,
  global = false,
  homeHref = '/',
  locale,
  reset,
  unstable_retry,
}: AppErrorBoundaryProps) {
  const copy = COPY[resolveLocale(locale)];
  const retry = unstable_retry ?? reset;
  const reference = error.digest;
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <main
      className={cn(
        'relative isolate grid w-full place-items-center overflow-hidden bg-background px-4 py-10 text-foreground',
        global ? 'min-h-screen' : 'min-h-[min(42rem,75vh)] rounded-2xl border'
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        aria-hidden="true"
      >
        <div className="absolute -top-24 -left-24 size-72 rounded-full bg-destructive/10 blur-3xl" />
        <div className="absolute -right-24 -bottom-24 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,currentColor_5%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,currentColor_5%,transparent)_1px,transparent_1px)] bg-[size:2.75rem_2.75rem] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <section className="w-full max-w-xl rounded-3xl border bg-background/90 p-5 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
              {appName} · {copy.badge}
            </div>
            <h1 className="mt-2 text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
              {copy.title}
            </h1>
            <p className="mt-2 text-pretty text-muted-foreground text-sm leading-6 sm:text-base">
              {copy.description}
            </p>
          </div>
        </div>

        {reference ? (
          <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/35 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{copy.reference}</span>
            <code className="min-w-0 break-all rounded-md bg-background px-2 py-1 font-mono text-xs">
              {reference}
            </code>
          </div>
        ) : null}

        <div className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Button
            className="w-full gap-2"
            onClick={() => retry?.()}
            type="button"
          >
            <RefreshCcw className="size-4" aria-hidden="true" />
            {copy.retry}
          </Button>
          <Button
            className="w-full gap-2"
            onClick={() => window.history.back()}
            type="button"
            variant="outline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {copy.back}
          </Button>
          <Button asChild className="w-full gap-2" variant="outline">
            <a href={homeHref}>
              <Home className="size-4" aria-hidden="true" />
              {copy.home}
            </a>
          </Button>
        </div>

        {isDevelopment && error.message ? (
          <details className="mt-5 rounded-2xl border bg-muted/25 p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {copy.details}
            </summary>
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-muted-foreground text-xs">
              {error.message}
            </pre>
          </details>
        ) : null}
      </section>
    </main>
  );
}

export function AppErrorBoundary(props: AppErrorBoundaryProps) {
  return <RecoveryView {...props} />;
}

export function GlobalAppErrorBoundary(props: AppErrorBoundaryProps) {
  const locale = resolveLocale(props.locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background">
        <RecoveryView {...props} global />
      </body>
    </html>
  );
}

export type { AppErrorBoundaryProps, BoundaryError };

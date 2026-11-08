import { Inter } from 'next/font/google';
import styles from './meet-loading.module.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap' });

function BrandMark({ src, theme }: { src: string; theme: 'light' | 'dark' }) {
  return (
    <div
      role="img"
      aria-label="Tuturuuu"
      className={`aspect-[2369/512] w-full bg-center bg-contain bg-no-repeat ${
        theme === 'light' ? 'dark:hidden' : 'hidden dark:block'
      }`}
      style={{ backgroundImage: `url(${src})` }}
    />
  );
}

/** Static markup: available before translations and client providers resolve. */
export function MeetLoading({
  labels,
}: {
  labels: { title: string; status: string; hint: string };
}) {
  return (
    <main
      className={`${inter.className} relative isolate grid min-h-dvh place-items-center overflow-hidden bg-background px-6 py-16 text-foreground`}
    >
      <div aria-hidden="true" className={styles.backdrop} />
      <section className="relative flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-9 w-52 sm:w-60">
          {/* CSS backgrounds, not <img>: this static server markup cannot handle
              `onError`, and a missing background never shows a broken glyph. */}
          <BrandMark src="/media/branding/brand-mark-light.svg" theme="light" />
          <BrandMark src="/media/branding/brand-mark-dark.svg" theme="dark" />
        </div>
        <h1 className="font-medium text-4xl tracking-tight sm:text-5xl">
          {labels.title}
        </h1>
        <p className="mt-4 text-balance text-muted-foreground text-sm leading-6">
          {labels.hint}
        </p>
        <div role="status" aria-live="polite" className="mt-12">
          <div aria-hidden="true" className={styles.track}>
            <span className={styles.indicator} />
          </div>
          <p className="mt-5 font-medium text-muted-foreground text-xs">
            {labels.status}
          </p>
        </div>
      </section>
    </main>
  );
}

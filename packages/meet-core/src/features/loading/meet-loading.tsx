import { Inter } from 'next/font/google';
import Image from 'next/image';
import styles from './meet-loading.module.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap' });

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
          <Image
            src="/media/branding/brand-mark-light.svg"
            alt="Tuturuuu"
            width={2369}
            height={512}
            className="h-auto w-full dark:hidden"
            unoptimized
          />
          <Image
            src="/media/branding/brand-mark-dark.svg"
            alt="Tuturuuu"
            width={2369}
            height={512}
            className="hidden h-auto w-full dark:block"
            unoptimized
          />
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

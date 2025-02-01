'use client';

import { Button } from '@repo/ui/components/ui/button';
// import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function Slogan() {
  // const t = useTranslations();
  return (
    <section className="relative overflow-hidden p-4">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-xl font-bold md:text-3xl">{'slogan.title'}</h2>
        <p className="mb-8 text-balance text-muted-foreground">
          {'slogan.description'}
        </p>
        <Link href="/contact">
          <Button size="lg">{'slogan.join_waitlist'}</Button>
        </Link>
      </div>
    </section>
  );
}

'use client';

import { Button } from '@repo/ui/components/ui/button';
import Link from 'next/link';

export default function Slogan() {
  // const t = useTranslations('common');

  // const maximize = t('maximize');
  // const productivity = t('productivity');
  // const minimize = t('minimize');
  // const stress = t('stress');

  // return (
  //   <div className="text-foreground/50 text-2xl font-semibold md:text-4xl">
  //     <span className="text-dynamic-green">{maximize}</span>{' '}
  //     <span className="text-dynamic-blue">{productivity}</span>,{' '}
  //     <span className="text-dynamic-orange">{minimize}</span>{' '}
  //     <span className="text-dynamic-red">{stress}</span>.
  //   </div>
  // );

  return (
    <section className="relative overflow-hidden p-4">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-xl font-bold md:text-3xl">
          Ready to Get Started?
        </h2>
        <p className="text-muted-foreground mb-8 text-balance">
          Join the waitlist to be among the first to experience our intelligent
          business management platform when it launches.
        </p>
        <Link href="/contact">
          <Button size="lg">Join Waitlist</Button>
        </Link>
      </div>
    </section>
  );
}

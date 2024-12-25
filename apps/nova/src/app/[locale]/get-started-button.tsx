'use client';

// import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function GetStartedButton({ href }: { href: string }) {
  // const t = useTranslations('home');

  return (
    <div className="group relative inline-flex">
      <div className="from-dynamic-light-red/80 via-dynamic-light-pink/80 to-dynamic-light-blue/80 animate-tilt absolute -inset-px rounded-lg bg-gradient-to-r opacity-70 blur-lg transition-all group-hover:-inset-1 group-hover:opacity-100 group-hover:duration-200" />
      <Link
        href={href}
        className="from-dynamic-light-red/60 via-dynamic-light-pink/60 to-dynamic-light-blue/60 relative inline-flex items-center justify-center rounded-lg bg-gradient-to-r px-8 py-2 font-bold text-white transition-all md:text-lg"
      >
        {/* {t('get-started')} */}{'Get started'}
      </Link>
    </div>
  );
}

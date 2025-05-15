'use client';

import Link from 'next/link';

export function GetStartedGradientButton({
  text,
  href,
}: {
  text: string;
  href: string;
}) {
  return (
    <div className="group relative inline-flex">
      <div className="animate-tilt from-dynamic-light-red/80 via-dynamic-light-pink/80 to-dynamic-light-blue/80 bg-linear-to-r absolute -inset-px rounded-lg opacity-70 blur-lg transition-all group-hover:-inset-1 group-hover:opacity-100 group-hover:duration-200" />
      <Link
        href={href}
        className="from-dynamic-light-red/60 via-dynamic-light-pink/60 to-dynamic-light-blue/60 bg-linear-to-r relative inline-flex items-center justify-center rounded-lg px-8 py-2 font-bold text-white transition-all md:text-lg"
      >
        {text}
      </Link>
    </div>
  );
}

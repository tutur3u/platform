'use client';

import { cn } from '@/lib/utils';

// import { useParams } from 'next/navigation';

export default function LogoTitle({}: {}) {
  // const params =useParams();

  return (
    <div
      className={cn(
        'from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-gradient-to-r bg-clip-text py-1 text-transparent',
        'text-4xl font-bold md:text-3xl lg:text-4xl'
      )}
    >
      Nova
    </div>
  );
}

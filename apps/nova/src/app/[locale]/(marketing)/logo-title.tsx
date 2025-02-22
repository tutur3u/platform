'use client';

import { cn } from '@tuturuuu/utils/format';

// import { useParams } from 'next/navigation';

export default function LogoTitle({}: {}) {
  // const params =useParams();

  return (
    <div
      className={cn(
        'bg-gradient-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 text-transparent',
        'text-4xl font-bold md:text-3xl lg:text-4xl'
      )}
    >
      Nova
    </div>
  );
}

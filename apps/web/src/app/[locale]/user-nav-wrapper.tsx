import { UserNav } from './user-nav';
import { Suspense } from 'react';

export async function UserNavWrapper() {
  return (
    <Suspense
      fallback={
        <div className="bg-foreground/5 h-10 w-10 animate-pulse rounded-lg" />
      }
    >
      <UserNav />
    </Suspense>
  );
}

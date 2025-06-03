'use client';

import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';

export default function LogButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <Button variant="destructive" onClick={handleLogout}>
      Log out
    </Button>
  );
}

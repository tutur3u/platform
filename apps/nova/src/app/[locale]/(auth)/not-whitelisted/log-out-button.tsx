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
    <div>
      <Button onClick={handleLogout} className="mt-4 bg-red-500 text-white">
        Log out
      </Button>
    </div>
  );
}

'use client';

import { Button } from '@tuturuuu/ui/button';
import { TTR_URL } from '@/constants/common';

export default function LogButton() {
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign(`${TTR_URL}/logout?from=Nova`);
  };

  return (
    <Button variant="destructive" onClick={handleLogout}>
      Log out
    </Button>
  );
}
